import { createHash } from "node:crypto";
import type { AuthContext } from "@medusajs/framework/http";
import type { MedusaContainer } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import Stripe from "stripe";
import { z } from "zod";
import { adminTaxSetupSchema, taxRegistrationId, taxSetupSnapshotSchema, type TaxSetupSnapshot } from "./tax-setup-contract";
import { isManagementMode } from "./operating-mode";

export type StripeTaxSetupReader = { livemode: boolean; account(): Promise<unknown>; settings(): Promise<unknown>; registrations(cursor?: string): Promise<unknown> };
export const taxSetupReaderRegistration = "snowforce_tax_setup_reader";
const unavailable = () => new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Stripe tax setup could not be verified. No registration, tax or payment was created.");
const registrationSchema = z.object({
  id: taxRegistrationId, object: z.literal("tax.registration"), country: z.string().regex(/^[A-Z]{2}$/),
  livemode: z.boolean(), active_from: z.number().int().positive().safe(), expires_at: z.number().int().positive().safe().nullable(),
  status: z.enum(["active", "expired", "scheduled"]),
  country_options: z.object({ us: z.object({ state: z.string().regex(/^[A-Z]{2}$/), type: z.string().min(1).max(100),
    state_sales_tax: z.object({ elections: z.array(z.object({ type: z.string(), jurisdiction: z.string().optional() })).max(100).optional() }).optional(),
  }).optional() }),
});
const settingsSchema = z.object({ object: z.literal("tax.settings"), livemode: z.boolean(), status: z.enum(["active", "pending"]),
  defaults: z.object({ provider: z.string().min(1).default("stripe"), tax_behavior: z.string().nullable(), tax_code: z.string().nullable() }),
  head_office: z.object({ address: z.object({ country: z.string().nullable(), state: z.string().nullable(),
    city: z.string().nullable().default(null), line1: z.string().nullable().default(null), line2: z.string().nullable().default(null), postal_code: z.string().nullable().default(null),
  }) }).nullable(),
  status_details: z.object({ pending: z.object({ missing_fields: z.array(z.string()).max(100).nullable() }).optional(), active: z.object({}).optional() }),
});
const usStates = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "));
const clock = () => Math.floor(Date.now() / 1000);
export function createStripeTaxSetupReader(client?: Pick<Stripe, "accounts" | "tax">, livemode?: boolean): StripeTaxSetupReader {
  if (!client) {
    const key = process.env.COMMERCE_STRIPE_API_KEY;
    if (!key || !/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(key)) throw unavailable();
    livemode = /^(sk|rk)_live_/.test(key);
    client = new Stripe(key, { apiVersion: "2026-09-30.endive", timeout: 15000, maxNetworkRetries: 1 });
  }
  if (typeof livemode !== "boolean") throw unavailable();
  const api = client;
  return { livemode, account: () => api.accounts.retrieveCurrent(), settings: () => api.tax.settings.retrieve(),
    registrations: cursor => api.tax.registrations.list({ status: "all", limit: 100, ...(cursor ? { starting_after: taxRegistrationId.parse(cursor) } : {}) }),
  };
}
function readerFor(scope: MedusaContainer) {
  return scope.resolve<StripeTaxSetupReader | undefined>(taxSetupReaderRegistration, { allowUnregistered: true }) ?? createStripeTaxSetupReader();
}
/** All pages and settings must succeed. A partial registration list is never collection evidence. */
export async function readStripeTaxSetup(reader: StripeTaxSetupReader, now = clock): Promise<TaxSetupSnapshot> {
  try {
    const started = z.number().int().positive().safe().parse(now());
    const [rawAccount, rawSettings] = await Promise.all([reader.account(), reader.settings()]);
    const account = z.object({ id: z.string().regex(/^acct_[A-Za-z0-9]+$/), object: z.literal("account") }).parse(rawAccount);
    const settings = settingsSchema.parse(rawSettings);
    if (settings.livemode !== reader.livemode) throw unavailable();
    const registrations: z.infer<typeof registrationSchema>[] = [], seen = new Set<string>();
    let cursor: string | undefined, complete = false;
    for (let page = 0; page < 20; page++) {
      const result = z.object({ object: z.literal("list"), has_more: z.boolean(), data: z.array(registrationSchema).max(100) }).parse(await reader.registrations(cursor));
      for (const registration of result.data) {
        if (seen.has(registration.id) || registration.livemode !== reader.livemode || registration.country === "US" && !registration.country_options.us || registration.expires_at !== null && registration.expires_at < registration.active_from) throw unavailable();
        seen.add(registration.id); registrations.push(registration);
      }
      if (!result.has_more) { complete = true; break; }
      if (!result.data.length) throw unavailable();
      cursor = result.data.at(-1)!.id;
    }
    const observed = z.number().int().positive().safe().parse(now());
    if (!complete || observed < started || observed - started > 60) throw unavailable();
    const blockers = new Set<TaxSetupSnapshot["blockers"][number]>(), sales = new Set<string>(), fees = new Set<"CO" | "MN">(), activeKeys = new Set<string>();
    if (settings.status !== "active") blockers.add("settings_pending");
    if (settings.defaults.provider !== "stripe") blockers.add("unsupported_provider");
    const address = settings.head_office?.address;
    if (address?.country !== "US" || !address.state || !usStates.has(address.state)) blockers.add("us_head_office_required");
    const projected = registrations.map(registration => {
      const us = registration.country_options.us;
      // The dates are authoritative; a registration may expire while pagination runs.
      const status = registration.expires_at !== null && registration.expires_at <= observed ? "expired" as const : registration.active_from > observed ? "scheduled" as const : "active" as const;
      if (status === "active" && registration.country === "US" && us) {
        const key = `${us.state}:${us.type}`;
        if (activeKeys.has(key)) blockers.add("duplicate_active_registration");
        activeKeys.add(key);
        if (registration.expires_at !== null && registration.expires_at <= observed + 300) blockers.add("registration_expiring");
        if (us.type === "state_sales_tax" && usStates.has(us.state)) sales.add(us.state);
        else if (us.type === "state_retail_delivery_fee" && (us.state === "CO" || us.state === "MN")) fees.add(us.state);
        else blockers.add("unsupported_active_registration");
      }
      return { id: registration.id, country: registration.country, state: registration.country === "US" ? us?.state ?? null : null,
        type: registration.country === "US" ? us?.type ?? null : null, active_from: registration.active_from, expires_at: registration.expires_at, status };
    }).sort((a, b) => a.id.localeCompare(b.id));
    if (!sales.has("CA")) blockers.add("california_registration_required");
    if ([...fees].some(state => !sales.has(state))) blockers.add("retail_fee_without_sales_tax");
    const fingerprint = createHash("sha256").update(JSON.stringify({ account_id: account.id, livemode: reader.livemode, settings,
      registrations: registrations.sort((a, b) => a.id.localeCompare(b.id)) })).digest("hex");
    return taxSetupSnapshotSchema.parse({ schema_version: 1, account_id: account.id, livemode: reader.livemode, observed_at: observed, fingerprint,
      settings: { status: settings.status, provider: settings.defaults.provider, head_office_country: address?.country ?? null, head_office_state: address?.state ?? null, missing_fields: settings.status_details.pending?.missing_fields ?? [] },
      registrations: projected, collecting_states: [...sales].sort(), collecting_retail_fee_states: [...fees].sort(), blockers: [...blockers].sort(), api_ready: blockers.size === 0 });
  } catch { throw unavailable(); }
}
export async function adminStripeTaxSetup(scope: MedusaContainer, auth: AuthContext | undefined) {
  if (auth?.actor_type !== "user" || !/^user_[A-Za-z0-9]+$/.test(auth.actor_id)) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in to the shop admin.");
  const snapshot = await readStripeTaxSetup(readerFor(scope));
  const policyConfirmed = process.env.COMMERCE_TAX_POLICY_CONFIRMED === "true";
  return adminTaxSetupSchema.parse({ snapshot, policy_confirmed: policyConfirmed, integration_ready: true,
    checkout_ready: snapshot.api_ready && policyConfirmed && !isManagementMode() });
}
export async function assertActiveStripeTaxSetup(scope: MedusaContainer, expectedFingerprint?: string) {
  const snapshot = await readStripeTaxSetup(readerFor(scope));
  if (!snapshot.api_ready) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Checkout needs active, verified Stripe tax settings and California registration.");
  if (expectedFingerprint && snapshot.fingerprint !== expectedFingerprint) throw new MedusaError(MedusaError.Types.CONFLICT, "Stripe tax setup changed. Review checkout again.");
  return snapshot;
}
