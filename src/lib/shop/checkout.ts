import { z } from "zod";
import { shippingAddressInputSchema } from "./shipping-addresses";
import type { CommerceCart } from "./commerce-cart";
import { commerceId, usdAmount } from "./storefront";
import { shopPublishedPolicySchema, type ShopPublishedPolicy } from "./policies";

export const checkoutAddressSchema = shippingAddressInputSchema.omit({ id: true, isDefault: true }).strict();
export type CheckoutAddress = z.infer<typeof checkoutAddressSchema>;
/** Client draft comparison only. This is not a payable quote fingerprint. */
export function checkoutAddressDraftKey(address: CheckoutAddress) {
  const parsed = checkoutAddressSchema.safeParse(address);
  return JSON.stringify(parsed.success ? parsed.data : address);
}
export const checkoutPickupContactSchema = checkoutAddressSchema.pick({ name: true, phone: true }).extend({ appointmentConfirmed: z.literal(true) }).strict();
export type CheckoutPickupContact = z.infer<typeof checkoutPickupContactSchema>;
export const checkoutPickupOfferSchema = z.object({ id: commerceId("so"), locationId: commerceId("sloc"), name: z.string().min(1).max(300), address: z.object({ address_1: z.string().min(1).max(200), address_2: z.string().nullable(), city: z.string().min(1).max(100), province: z.literal("ca"), postal_code: z.string().regex(/^\d{5}(?:-\d{4})?$/), country_code: z.literal("us") }) }).strict();
export const checkoutInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("delivery"), address: checkoutAddressSchema, version: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict(),
  z.object({ kind: z.literal("address"), address: checkoutAddressSchema }).strict(),
  z.object({ kind: z.literal("pickup"), contact: checkoutPickupContactSchema }).strict(),
  z.object({ kind: z.literal("pickup-review"), contact: checkoutPickupContactSchema, version: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict(),
  z.object({ kind: z.literal("shipping"), optionId: commerceId("so") }).strict(),
  z.object({ kind: z.literal("shipping-review"), optionId: commerceId("so") }).strict(),
  z.object({ kind: z.literal("quote") }).strict(),
  z.object({ kind: z.literal("payment"), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), policyVersion: z.number().int().min(1).max(1_000_000), agreed: z.literal(true) }).strict(),
  z.object({ kind: z.literal("complete") }).strict(),
  z.object({ kind: z.literal("recover") }).strict(),
]);
const cents = z.number().int().nonnegative().max(99_999_999);
const publicTaxAmounts = z.object({
  totalCents: cents, grossCents: cents, discountCents: cents, merchandiseCents: cents, shippingCents: cents, salesTaxCents: cents,
  fees: z.array(z.object({ state: z.enum(["CO", "MN"]), amountCents: cents })).max(1),
  expiresAt: z.number().int().positive(),
}).strict();
const amountsReconcile = (quote: z.infer<typeof publicTaxAmounts>) => quote.grossCents - quote.discountCents === quote.merchandiseCents && quote.totalCents === quote.merchandiseCents + quote.shippingCents + quote.salesTaxCents + quote.fees.reduce((sum, fee) => sum + fee.amountCents, 0);
export const checkoutTaxQuoteSchema = publicTaxAmounts.extend({ ready: z.boolean() }).strict().refine(amountsReconcile, "Quote amounts must reconcile.");
export type CheckoutTaxQuote = z.infer<typeof checkoutTaxQuoteSchema>;
export const checkoutQuoteResponseSchema = z.object({ status: z.literal("quoted"), reused: z.boolean(), taxQuote: publicTaxAmounts.refine(amountsReconcile, "Quote amounts must reconcile.") }).strict();
export const checkoutStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("review"), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), detailsVersion: z.string().regex(/^[a-f0-9]{64}$/).nullable().default(null), paymentStarted: z.boolean(), configured: z.boolean(), policy: shopPublishedPolicySchema.nullable(), policyAccepted: z.boolean(), taxQuote: checkoutTaxQuoteSchema.nullable(), pickupOffer: checkoutPickupOfferSchema.nullable().default(null), pickupSelected: z.boolean().default(false) }),
  z.object({ status: z.literal("complete"), order: z.object({ id: commerceId("order"), number: z.string().min(1), total: usdAmount }) }),
  z.object({ status: z.literal("payment"), clientSecret: z.string().regex(/^pi_[a-zA-Z0-9]+_secret_[a-zA-Z0-9]+$/), totalCents: z.number().int().positive().max(99_999_999), currency: z.literal("usd") }),
  z.object({ status: z.literal("processing") }),
]);
export const checkoutRecoverySchema = z.union([
  checkoutStatusSchema.options[1],
  z.object({ status: z.literal("recovered"), unlocked: z.boolean() }).strict(),
]);
export type CheckoutShippingOption = { id: string; name: string; price: number };
export type CheckoutReview = { status: "review"; cart: CommerceCart; address: CheckoutAddress | null; options: CheckoutShippingOption[]; selectedOptionId: string | null; fingerprint: string; detailsVersion?: string | null; paymentStarted: boolean; configured: boolean; policy: ShopPublishedPolicy | null; policyAccepted: boolean; taxQuote: CheckoutTaxQuote | null; pickupOffer?: z.infer<typeof checkoutPickupOfferSchema> | null; pickupSelected?: boolean; paymentCheck?: "unlocked" | "active" };
export type CheckoutResult = CheckoutReview | { status: "payment"; clientSecret: string; publishableKey: string; total: number } | { status: "complete"; order: { id: string; number: string; total: number } } | { status: "empty" | "signed-out" | "unavailable" | "not-configured" | "rejected" | "invalid" | "processing" | "stale-details" };

export function nativeCheckoutAddress(address: CheckoutAddress) {
  const parsed = checkoutAddressSchema.parse(address);
  const [first, ...last] = parsed.name.split(/\s+/);
  return { first_name: first, last_name: last.join(" "), address_1: parsed.address1, address_2: parsed.address2, city: parsed.city, province: parsed.state.toLowerCase(), postal_code: parsed.postalCode, country_code: "us", phone: parsed.phone };
}
