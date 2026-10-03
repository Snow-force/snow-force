import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { ICartModuleService, MedusaContainer } from "@medusajs/framework/types";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { z } from "zod";
import { checkoutCartSchema, checkoutFingerprint, paymentStarted, type CheckoutCart } from "./checkout-policy";
import { assertPublishableShopPolicy, publicShopPolicy, publishedShopPolicySchema, type PublishedShopPolicy } from "./shop-policy";

// The native cart workflow copies this public terms snapshot into the order atomically.
// Cart metadata is customer-writable; its HMAC is mandatory, never a client assertion.
export const policyAcceptanceKey = "snowforce_policy_acceptance";
const unsignedSchema = z.object({ schema_version: z.literal(1), cart_id: z.string(), customer_id: z.string().min(1), quote: z.string().regex(/^[a-f0-9]{64}$/), accepted_at: z.iso.datetime(), policy: publishedShopPolicySchema }).strict();
const acceptanceSchema = unsignedSchema.extend({ signature: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type PolicyAcceptance = z.infer<typeof acceptanceSchema>;
const unavailable = () => new MedusaError(MedusaError.Types.CONFLICT, "Review and accept the effective shop policy before paying.");
export function policySigningConfigured() { return (process.env.JWT_SECRET?.length ?? 0) >= 32; }
function secret() {
  if (!policySigningConfigured()) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Policy verification is not configured.");
  // Domain separation from Medusa's JWT authentication; no additional browser credential.
  return createHmac("sha256", process.env.JWT_SECRET!).update("snowforce/shop-policy-consent/v1").digest();
}
export function policyReviewFingerprint(cart: CheckoutCart, policy: PublishedShopPolicy | null) {
  return createHash("sha256").update(JSON.stringify({ quote: checkoutFingerprint(cart), policy: policy ? publishedShopPolicySchema.parse(policy) : null })).digest("hex");
}
export function sealPolicyAcceptance(cart: CheckoutCart, policy: PublishedShopPolicy, at: string): PolicyAcceptance {
  assertPublishableShopPolicy(policy.content);
  const unsigned = unsignedSchema.parse({ schema_version: 1, cart_id: cart.id, customer_id: cart.customer_id, quote: checkoutFingerprint(cart), accepted_at: at, policy });
  return { ...unsigned, signature: createHmac("sha256", secret()).update(JSON.stringify(unsigned)).digest("hex") };
}
export function verifyPolicyAcceptance(cart: CheckoutCart, now = new Date().toISOString()) {
  const parsed = acceptanceSchema.safeParse(cart.metadata?.[policyAcceptanceKey]);
  if (!parsed.success) throw unavailable();
  const { signature, ...unsigned } = parsed.data;
  const expected = createHmac("sha256", secret()).update(JSON.stringify(unsignedSchema.parse(unsigned))).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex")) || unsigned.cart_id !== cart.id || unsigned.customer_id !== cart.customer_id || unsigned.quote !== checkoutFingerprint(cart) || Date.parse(unsigned.accepted_at) > Date.parse(now) || Date.parse(unsigned.policy.effective_at) > Date.parse(unsigned.accepted_at)) throw unavailable();
  return parsed.data;
}

/** The completed order keeps the original quote; later fulfillment is not a new checkout. */
export function verifyOrderPolicyAcceptance(order: { customer_id: string; created_at: string; metadata?: Record<string, unknown> | null }, cartId: string) {
  const receipt = acceptanceSchema.parse(order.metadata?.[policyAcceptanceKey]);
  const { signature, ...unsigned } = receipt;
  const expected = createHmac("sha256", secret()).update(JSON.stringify(unsignedSchema.parse(unsigned))).digest();
  const createdAt = z.iso.datetime().parse(order.created_at);
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex")) || receipt.cart_id !== cartId || receipt.customer_id !== order.customer_id || Date.parse(receipt.accepted_at) > Date.parse(createdAt) || Date.parse(receipt.policy.effective_at) > Date.parse(receipt.accepted_at)) throw unavailable();
  assertPublishableShopPolicy(receipt.policy.content);
  return receipt;
}
export async function assertAcceptedShopPolicy(cart: CheckoutCart, scope: MedusaContainer) {
  const receipt = verifyPolicyAcceptance(cart);
  assertPublishableShopPolicy(receipt.policy.content);
  // Check the signed version itself. A concurrently committing publication may
  // have an earlier timestamp even though the accepting read could not see it.
  const effectiveAtAcceptance = await publicShopPolicy(scope, receipt.accepted_at, receipt.policy.version);
  if (!effectiveAtAcceptance || JSON.stringify(effectiveAtAcceptance) !== JSON.stringify(receipt.policy)) throw unavailable();
  return receipt;
}
export async function checkoutPolicyReview(cart: CheckoutCart, scope: MedusaContainer) {
  const policy = paymentStarted(cart) ? (await assertAcceptedShopPolicy(cart, scope)).policy : await publicShopPolicy(scope);
  if (policy) assertPublishableShopPolicy(policy.content);
  return { policy, policyAccepted: paymentStarted(cart), fingerprint: policyReviewFingerprint(cart, policy) };
}
export async function acceptCheckoutPolicy(cart: CheckoutCart, scope: MedusaContainer, input: { fingerprint: string; policyVersion: number; agreed: true }) {
  const at = new Date().toISOString();
  const policy = paymentStarted(cart) ? (await assertAcceptedShopPolicy(cart, scope)).policy : await publicShopPolicy(scope, at);
  if (!policy || input.agreed !== true || input.policyVersion !== policy.version || input.fingerprint !== policyReviewFingerprint(cart, policy)) throw unavailable();
  if (paymentStarted(cart)) return verifyPolicyAcceptance(cart);
  const receipt = sealPolicyAcceptance(cart, policy, at);
  const cartModule = scope.resolve<ICartModuleService>(Modules.CART);
  await cartModule.updateCarts(cart.id, { metadata: { ...cart.metadata, [policyAcceptanceKey]: receipt } });
  return receipt;
}

/** Check the initial workflow value that will actually be copied to the order. */
export async function assertWorkflowPolicySnapshot(initial: unknown, current: CheckoutCart, scope: MedusaContainer) {
  const raw = z.object({ customer: z.object({ id: z.string() }).nullable(), region: z.object({ id: z.string() }).nullable() }).passthrough().parse(initial);
  const initialCart = checkoutCartSchema.parse({ ...raw, customer_id: raw.customer?.id ?? null, region_id: raw.region?.id });
  const initialReceipt = await assertAcceptedShopPolicy(initialCart, scope);
  const currentReceipt = await assertAcceptedShopPolicy(current, scope);
  if (checkoutFingerprint(initialCart) !== checkoutFingerprint(current) || initialReceipt.signature !== currentReceipt.signature) throw unavailable();
}
