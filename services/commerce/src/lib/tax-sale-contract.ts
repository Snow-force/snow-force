import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { z } from "zod";
import { stripeTaxCalculationSchema, taxMoneyCents, taxQuoteInputSchema } from "./tax-quote-contract";
import { normalizeStripeTaxQuote } from "./tax-quote-money";

export const saleOrderId = z.string().regex(/^order_[A-Za-z0-9]{1,114}$/);
export const saleTransactionId = z.string().regex(/^tax_[A-Za-z0-9]+$/);
const id = z.string().min(1).max(120), epoch = z.coerce.number().int().positive().safe();
export const taxSaleSourceSchema = z.object({
  schema_version: z.literal(1), order_id: saleOrderId, cart_id: id, customer_id: id, quote_id: z.uuid(),
  payment_id: id, session_id: id, capture_id: id, intent_id: z.string().regex(/^pi_[A-Za-z0-9]+$/), captured_at: epoch,
  receipt: z.record(z.string(), z.unknown()), input: taxQuoteInputSchema, calculation: stripeTaxCalculationSchema,
}).strict();
export type TaxSaleSource = z.infer<typeof taxSaleSourceSchema>;
export class TaxSaleConflict extends Error { constructor() { super("Captured sale tax evidence needs reconciliation."); } }
const conflict = () => new TaxSaleConflict();
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}
export const taxSaleFingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export function checkedTaxSaleSource(raw: unknown) {
  const source = taxSaleSourceSchema.parse(raw), quote = normalizeStripeTaxQuote(source.input, source.calculation, source.input.tax_date);
  const receipt = z.object({ quote_id: z.literal(source.quote_id), cart_id: z.literal(source.cart_id), customer_id: z.literal(source.customer_id),
    account_id: z.literal(quote.account_id), livemode: z.literal(quote.livemode), total_cents: z.literal(quote.amounts.total_cents),
    checkout_fingerprint: z.string().regex(/^[a-f0-9]{64}$/), signature: z.string().regex(/^[a-f0-9]{64}$/), expires_at: z.literal(quote.expires_at),
  }).parse(source.receipt);
  if (source.input.cart_id !== source.cart_id || source.input.customer_id !== source.customer_id || source.captured_at < quote.tax_date) throw conflict();
  return { source, quote, receipt };
}
/** Saved once, before any provider POST. Recovery never replaces reference or posting date. */
export function taxSaleRequest(raw: unknown, operationId: string): Stripe.Tax.TransactionCreateFromCalculationParams {
  const { source, quote } = checkedTaxSaleSource(raw), operation = z.uuid().parse(operationId);
  return { calculation: quote.calculation_id, reference: `snowforce-sale:${operation}`, posted_at: source.captured_at,
    metadata: { snowforce_operation: operation, snowforce_order: source.order_id, snowforce_quote: source.quote_id, snowforce_capture: source.capture_id },
  };
}
const addressSchema = z.object({ country: z.string(), state: z.string().nullable(), city: z.string().nullable(), line1: z.string().nullable(), line2: z.string().nullable().optional(), postal_code: z.string().nullable() });
const addressKey = (raw: unknown) => { const a = addressSchema.parse(raw); return [a.country, a.state, a.city, a.line1, a.line2 ?? "", a.postal_code].map(value => (value ?? "").trim().toUpperCase()).join("\n"); };
const headerSchema = z.object({ id: saleTransactionId, object: z.literal("tax.transaction"), currency: z.literal("usd"), livemode: z.boolean(),
  type: z.literal("transaction"), reversal: z.null(), created: epoch, posted_at: epoch, tax_date: epoch, reference: z.string(), metadata: z.record(z.string(), z.string()),
  customer_details: z.object({ address: addressSchema, address_source: z.literal("shipping"), taxability_override: z.literal("none") }),
  ship_from_details: z.object({ address: addressSchema }),
  shipping_cost: z.object({ amount: taxMoneyCents, amount_tax: taxMoneyCents, tax_behavior: z.literal("exclusive"), tax_code: z.string() }),
});
export const taxSaleLineSchema = z.object({ id: z.string().regex(/^tax_li_[A-Za-z0-9]+$/), object: z.literal("tax.transaction_line_item"),
  amount: taxMoneyCents, amount_tax: taxMoneyCents, quantity: z.number().int().positive().safe(), reference: z.string(), tax_code: z.string(),
  tax_behavior: z.literal("exclusive"), livemode: z.boolean(), type: z.literal("transaction"), reversal: z.null(),
});
export function assertTaxSaleHeader(rawSource: unknown, operationId: string, raw: unknown) {
  const { source, quote } = checkedTaxSaleSource(rawSource), request = taxSaleRequest(source, operationId), transaction = headerSchema.parse(raw);
  if (transaction.reference !== request.reference || transaction.livemode !== quote.livemode || transaction.posted_at !== request.posted_at || transaction.tax_date !== quote.tax_date ||
    transaction.created < transaction.posted_at || Object.entries(request.metadata!).some(([key, value]) => transaction.metadata[key] !== value) ||
    addressKey(transaction.customer_details.address) !== addressKey(quote.input.shipping_address) || addressKey(transaction.ship_from_details.address) !== addressKey(quote.input.ship_from_address) ||
    transaction.shipping_cost.amount !== quote.shipping.amount_cents || transaction.shipping_cost.amount_tax !== quote.shipping.sales_tax_cents + quote.amounts.government_fee_cents || transaction.shipping_cost.tax_code !== quote.shipping.tax_code) throw conflict();
  return transaction;
}
/** Save transaction line IDs for later specific-item reversals; equal totals alone are insufficient. */
export function assertTaxSaleTransaction(rawSource: unknown, operationId: string, raw: unknown, rawLines: unknown) {
  const { quote } = checkedTaxSaleSource(rawSource), transaction = assertTaxSaleHeader(rawSource, operationId, raw);
  const lines = z.array(taxSaleLineSchema).min(1).max(100).parse(rawLines);
  if (lines.length !== quote.lines.length || new Set(lines.map(line => line.id)).size !== lines.length || new Set(lines.map(line => line.reference)).size !== lines.length) throw conflict();
  for (const original of quote.lines) {
    const line = lines.find(row => row.reference === original.id);
    if (!line || line.amount !== original.net_cents || line.amount_tax !== original.sales_tax_cents || line.quantity !== original.quantity || line.tax_code !== original.tax_code || line.livemode !== quote.livemode) throw conflict();
  }
  const total = lines.reduce((sum, line) => sum + line.amount + line.amount_tax, 0) + transaction.shipping_cost.amount + transaction.shipping_cost.amount_tax;
  if (total !== quote.amounts.total_cents) throw conflict();
  return { schema_version: 1 as const, transaction, lines: lines.sort((a, b) => a.reference.localeCompare(b.reference)), total_cents: total };
}
export { taxSaleAdminSchema } from "./tax-sale-admin-contract";
