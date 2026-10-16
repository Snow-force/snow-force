import { createHash } from "node:crypto";
import { z } from "zod";
import { MathBN } from "@medusajs/framework/utils";

export const stripeProviderId = "pp_stripe_stripe";
export function assertUsCheckoutRegion(value: unknown) {
  return z.object({ currency_code: z.literal("usd"), countries: z.array(z.object({ iso_2: z.literal("us") })).length(1) }).parse(value);
}
const amount = z.coerce.number().finite().nonnegative().max(20_000_000);
const nativeEmptyAddress = z.object({
  country_code: z.literal("us"), first_name: z.null().optional(), last_name: z.null().optional(),
  address_1: z.null().optional(), address_2: z.null().optional(), city: z.null().optional(),
  province: z.null().optional(), postal_code: z.null().optional(), phone: z.null().optional(),
});
const shippingAddress = z.preprocess(
  value => nativeEmptyAddress.safeParse(value).success ? null : value,
  z.object({ first_name: z.string(), last_name: z.string().nullable(), address_1: z.string(), address_2: z.string().nullable(), city: z.string(), province: z.string(), postal_code: z.string(), country_code: z.literal("us"), phone: z.string() }).nullable().default(null),
);
export const checkoutCartSchema = z.object({
  id: z.string().regex(/^cart_[a-zA-Z0-9]+$/), customer_id: z.string().nullable(),
  currency_code: z.literal("usd"), region_id: z.string(), email: z.string().email().nullable(), completed_at: z.unknown().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable().default(null),
  total: amount, subtotal: amount, tax_total: amount, shipping_total: amount, discount_total: amount,
  item_total: amount, item_tax_total: amount,
  // Native US cart creation may omit the address or persist only its country.
  // Both represent an unfilled address; assertCheckoutReady still rejects them.
  shipping_address: shippingAddress,
  shipping_methods: z.array(z.object({ id: z.string(), shipping_option_id: z.string(), name: z.string(), amount })),
  items: z.array(z.object({ id: z.string(), variant_id: z.string().nullable(), product_handle: z.string().nullable(), product_title: z.string().nullable(), title: z.string(), variant_title: z.string().nullable(), thumbnail: z.string().nullable(), quantity: z.number().int().positive(), unit_price: amount, total: amount })),
  // Native graph reads omit an unlinked collection on a newly created cart.
  payment_collection: z.object({ id: z.string(), amount, currency_code: z.string(), payment_sessions: z.array(z.object({ id: z.string(), provider_id: z.string(), amount, currency_code: z.string(), status: z.string(), data: z.record(z.string(), z.unknown()).nullable(), metadata: z.record(z.string(), z.unknown()).nullish() })) }).nullable().default(null),
});
export type CheckoutCart = z.infer<typeof checkoutCartSchema>;
const shippingPricingFields = ["item_total", "item_tax_total"];
export const checkoutFields = [...shippingPricingFields, "metadata", "id", "customer_id", "currency_code", "region_id", "email", "completed_at", "total", "subtotal", "tax_total", "shipping_total", "discount_total", "shipping_address.*", "shipping_methods.id", "shipping_methods.shipping_option_id", "shipping_methods.name", "shipping_methods.amount", "items.id", "items.variant_id", "items.product_handle", "items.product_title", "items.title", "items.variant_title", "items.thumbnail", "items.quantity", "items.unit_price", "items.total", "payment_collection.id", "payment_collection.amount", "payment_collection.currency_code", "payment_collection.payment_sessions.*"];

export function checkoutFingerprint(cart: CheckoutCart) {
  // Deliberately excludes provider secrets and session IDs: initiating a session must not change the reviewed quote.
  const { id, customer_id, currency_code, region_id, email, total, subtotal, tax_total, shipping_total, discount_total, shipping_address } = cart;
  return createHash("sha256").update(JSON.stringify({ id, customer_id, currency_code, region_id, email, total, subtotal, tax_total, shipping_total, discount_total, shipping_address, items: [...cart.items].sort((a, b) => a.id.localeCompare(b.id)), shipping_methods: [...cart.shipping_methods].sort((a, b) => a.id.localeCompare(b.id)) })).digest("hex");
}
export function paymentStarted(cart: Pick<CheckoutCart, "payment_collection">) {
  // Even a locally canceled session needs remote verification and retirement
  // of its cart link before native cart refresh may safely run.
  return !!cart.payment_collection?.payment_sessions.length;
}
export function assertCheckoutReady(cart: CheckoutCart, taxPolicyConfirmed: boolean) {
  if (!taxPolicyConfirmed || cart.completed_at || !cart.customer_id || !cart.email || !cart.items.length || !cart.shipping_address || cart.shipping_methods.length !== 1 || cart.total <= 0) throw new Error("Checkout is not ready.");
  const address = cart.shipping_address;
  if (![address.first_name, address.address_1, address.city, address.province, address.postal_code, address.phone].every((value) => value.trim()) || !/^\d{5}(?:-\d{4})?$/.test(address.postal_code)) throw new Error("A complete US shipping address is required.");
}
export function assertPaymentMatches(cart: CheckoutCart, quotedCents?: number) {
  const collection = cart.payment_collection;
  const sessions = collection?.payment_sessions.filter((session) => session.status !== "canceled") ?? [];
  const cents = (value: number) => {
    const result = MathBN.mult(value, 100).toNumber();
    if (!Number.isSafeInteger(result) || result <= 0) throw new Error("Exact USD payment cents are required.");
    return result;
  };
  const expected = quotedCents === undefined ? cents(cart.total) : z.number().int().positive().max(99_999_999).parse(quotedCents);
  if (MathBN.mult(cart.total, 100).integerValue(4).toNumber() !== expected || !collection || collection.currency_code !== "usd" || cents(collection.amount) !== expected || sessions.length !== 1 || sessions[0].provider_id !== stripeProviderId || sessions[0].currency_code !== "usd" || cents(sessions[0].amount) !== expected) throw new Error("Payment no longer matches the reviewed cart.");
  return sessions[0];
}
