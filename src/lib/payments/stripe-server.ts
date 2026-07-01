import "server-only";

import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function getStripeServer(): Stripe {
  if (stripeInstance) return stripeInstance;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  stripeInstance = new Stripe(secretKey);
  return stripeInstance;
}

export type StripeWebhookEventType = "checkout.session.completed";

export function verifyStripeWebhookSignature(
  rawBody: string,
  signature: string,
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  }

  return getStripeServer().webhooks.constructEvent(
    rawBody,
    signature,
    webhookSecret,
  );
}
