import { z } from "zod";

// Shared schemas must not load reservation, worker or execution modules:
// those modules initialize their own schemas from these exports at startup.
export const nativeRefundId = z.string().regex(/^ref_[A-Za-z0-9]+$/).max(120);
export const stripeRefundId = z.string().regex(/^re_[A-Za-z0-9]+$/).max(120);

// Stripe Refund has no livemode field. Account and environment are verified
// separately against the protected key and the original PaymentIntent.
export const verifiedStripeRefundSchema = z.object({
  id: stripeRefundId, object: z.literal("refund"), amount: z.number().int().positive().max(99_999_999),
  currency: z.literal("usd"), status: z.literal("succeeded"), created: z.coerce.number().int().positive().safe(),
  payment_intent: z.union([z.string().regex(/^pi_[A-Za-z0-9]+$/), z.object({ id: z.string().regex(/^pi_[A-Za-z0-9]+$/) })])
    .transform(value => typeof value === "string" ? value : value.id),
  metadata: z.object({ snowforce_operation: z.uuid(), snowforce_allocation: z.string(), snowforce_order: z.string(), snowforce_payment: z.string() }),
});
