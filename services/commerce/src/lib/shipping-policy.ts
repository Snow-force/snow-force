import { z } from "zod";
import { exactTaxUsdCents } from "./tax-quote-money";

export const shippingPolicySchema = z.object({
  fee_cents: z.number().int().min(0).max(100_000),
  free_threshold_cents: z.number().int().min(1).max(10_000_000),
}).strict();
export type ShippingPolicy = z.infer<typeof shippingPolicySchema>;
export const initialShippingPolicy: ShippingPolicy = { fee_cents: 995, free_threshold_cents: 10_000 };
export const snowforceShippingCode = "snowforce-us-standard";
export const snowforcePickupCode = "snowforce-local-pickup";
export const pickupShippingPolicy: ShippingPolicy = { fee_cents: 0, free_threshold_cents: 1 };
export const snowforceShippingProviderId = "snowforce_us_snowforce";

export function discountedItemCents(itemTotal: unknown, itemTaxTotal: unknown) {
  const value = z.coerce.number().finite().nonnegative();
  const total = value.parse(itemTotal); const tax = value.parse(itemTaxTotal);
  if (tax > total) throw new Error("Invalid merchandise tax totals.");
  return Math.round((total - tax) * 100);
}

export function calculatedShippingCents(policy: ShippingPolicy, itemCents: number) {
  const parsed = shippingPolicySchema.parse(policy);
  z.number().int().nonnegative().parse(itemCents);
  return itemCents >= parsed.free_threshold_cents ? 0 : parsed.fee_cents;
}

// Medusa v2 amounts use major currency units; member snapshots use integer cents.
export function shippingPriceRecords(input: ShippingPolicy) {
  const policy = shippingPolicySchema.parse(input);
  return [
    { currency_code: "usd", amount: policy.fee_cents / 100, rules: [] },
    { currency_code: "usd", amount: 0, rules: [{ attribute: "item_total", operator: "gte" as const, value: policy.free_threshold_cents / 100 }] },
  ];
}

const priceSchema = z.object({ currency_code: z.literal("usd"), amount: z.unknown(), price_rules: z.array(z.object({ attribute: z.string(), operator: z.string(), value: z.unknown() })) });
export function readShippingPolicy(prices: unknown): ShippingPolicy {
  const records = z.array(priceSchema).length(2).parse(prices).map(record=>({...record,amount_cents:exactTaxUsdCents(record.amount)}));
  const base = records.find((record) => record.price_rules.length === 0);
  const free = records.find((record) => record.amount_cents === 0 && record.price_rules.length === 1 && record.price_rules[0].attribute === "item_total" && record.price_rules[0].operator === "gte");
  if (!base || !free) throw new Error("Unexpected shipping pricing; review the option in Medusa.");
  return shippingPolicySchema.parse({ fee_cents: base.amount_cents, free_threshold_cents: exactTaxUsdCents(free.price_rules[0].value) });
}
