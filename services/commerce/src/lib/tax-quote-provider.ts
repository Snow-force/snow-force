import { createHash } from "node:crypto";
import { MedusaError } from "@medusajs/framework/utils";
import Stripe from "stripe";
import { z } from "zod";
import { stripeTaxCalculationSchema, taxQuoteInputSchema, type TaxQuoteInput } from "./tax-quote-contract";
import { normalizeStripeTaxQuote } from "./tax-quote-money";

export type StripeTaxQuoteWriter = {
  livemode: boolean;
  namespace: string;
  account(): Promise<unknown>;
  createCalculation(parameters: Stripe.Tax.CalculationCreateParams, idempotencyKey: string): Promise<unknown>;
  listLineItems(id: string, parameters: Stripe.Tax.CalculationListLineItemsParams): Promise<unknown>;
};
export const taxQuoteWriterRegistration = "snowforce_tax_quote_writer";
const calculationId = z.string().regex(/^taxcalc_[A-Za-z0-9]+$/).max(120);
const operationId = z.uuid();
const lineSchema = stripeTaxCalculationSchema.shape.line_items.shape.data.element;
const listSchema = z.object({
  object: z.literal("list"), url: z.string(), has_more: z.boolean(),
  total_count: z.number().int().nonnegative().max(100).optional(),
  data: z.array(lineSchema.extend({ object: z.literal("tax.calculation_line_item") })).max(100),
});
const unavailable = () => new MedusaError(MedusaError.Types.CONFLICT,
  "The tax quote could not be verified. Its request has been preserved; review this cart again.");
const lease = (signals: readonly (AbortSignal | undefined)[]) => { if (signals.some(signal => signal?.aborted)) throw unavailable(); };

/** Production always uses the protected commerce key and the installed SDK's fixed Stripe endpoint. */
export function createStripeTaxQuoteWriter(client?: Pick<Stripe, "accounts" | "tax">, livemode?: boolean, namespace?: string): StripeTaxQuoteWriter {
  if (!client) {
    const key = process.env.COMMERCE_STRIPE_API_KEY;
    if (!key || !/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(key)) throw unavailable();
    livemode = /^(sk|rk)_live_/.test(key);
    namespace = createHash("sha256").update(key).digest("hex");
    client = new Stripe(key, { apiVersion: "2026-09-30.endive", timeout: 15_000, maxNetworkRetries: 1 });
  }
  if (typeof livemode !== "boolean" || !z.string().regex(/^[a-f0-9]{64}$/).safeParse(namespace).success) throw unavailable();
  const api = client;
  return {
    livemode, namespace: namespace!, account: () => api.accounts.retrieveCurrent(),
    createCalculation: (parameters, key) => {
      if (!/^snowforce-tax-quote:[0-9a-f-]{36}$/.test(key)) throw unavailable();
      operationId.parse(key.slice("snowforce-tax-quote:".length));
      return api.tax.calculations.create(parameters, { idempotencyKey: key });
    },
    listLineItems: (id, parameters) => api.tax.calculations.listLineItems(calculationId.parse(id), parameters),
  };
}

/** Read every page from the SDK resource, never a provider-supplied URL. No incomplete result is persisted. */
export async function collectStripeTaxQuote(writer: StripeTaxQuoteWriter, rawInput: unknown, rawCalculation: unknown,
  signals: readonly (AbortSignal | undefined)[] = [], now = () => Math.floor(Date.now() / 1000)) {
  try {
    lease(signals);
    const input: TaxQuoteInput = taxQuoteInputSchema.parse(rawInput);
    const header = stripeTaxCalculationSchema.omit({ line_items: true }).parse(rawCalculation);
    const raw = z.object({ line_items: z.unknown().optional() }).parse(rawCalculation);
    const id = calculationId.parse(header.id), url = `/v1/tax/calculations/${id}/line_items`;
    if (writer.livemode !== input.livemode || header.livemode !== input.livemode) throw unavailable();
    // A response's advertised count must agree even though the listing endpoint doesn't require total_count.
    const initial = raw.line_items == null ? null : listSchema.parse(raw.line_items);
    if (initial && (initial.url !== url || initial.total_count !== undefined && initial.total_count !== input.lines.length ||
      initial.data.length > input.lines.length || !initial.has_more && initial.data.length !== input.lines.length ||
      new Set(initial.data.map(line => line.id)).size !== initial.data.length || new Set(initial.data.map(line => line.reference)).size !== initial.data.length)) throw unavailable();
    const lines: z.infer<typeof lineSchema>[] = [], ids = new Set<string>(), references = new Set<string>();
    let cursor: string | undefined, complete = false;
    // At most 100 input lines; even one-line pages must finish within this bound and the shared lease.
    for (let page = 0; page < 100; page++) {
      lease(signals);
      const result = listSchema.parse(await writer.listLineItems(id, { limit: 100, expand: ["data.tax_breakdown"], ...(cursor ? { starting_after: cursor } : {}) }));
      lease(signals);
      if (result.url !== url || result.total_count !== undefined && result.total_count !== input.lines.length || !result.data.length) throw unavailable();
      for (const line of result.data) {
        if (ids.has(line.id) || references.has(line.reference) || line.livemode !== input.livemode || !input.lines.some(source => source.id === line.reference)) throw unavailable();
        ids.add(line.id); references.add(line.reference); lines.push(lineSchema.parse(line));
      }
      if (lines.length > input.lines.length || result.has_more && lines.length >= input.lines.length) throw unavailable();
      if (!result.has_more) { complete = true; break; }
      cursor = result.data.at(-1)!.id;
    }
    if (!complete || lines.length !== input.lines.length) throw unavailable();
    for (const line of initial?.data ?? []) {
      const listed = lines.find(candidate => candidate.id === line.id);
      if (!listed || JSON.stringify(lineSchema.parse(line)) !== JSON.stringify(listed)) throw unavailable();
    }
    // total_count here is a verified local count, not a fabricated claim about an incomplete provider list.
    const calculation = stripeTaxCalculationSchema.parse({ ...header, line_items: { has_more: false, total_count: lines.length, data: lines } });
    normalizeStripeTaxQuote(input, calculation, now());
    lease(signals);
    return calculation;
  } catch { throw unavailable(); }
}
