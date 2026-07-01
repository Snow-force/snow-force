"use server";
import "server-only";

import type Stripe from "stripe";
import type { Event } from "@/lib/types";
import type { PendingRegistration } from "@/lib/registrations/pending-repository";
import { getStripeServer } from "@/lib/payments/stripe-server";
import { getPendingRegistrationById } from "@/lib/registrations/pending-repository";
import { getEvent } from "@/lib/events/repository";

export type CheckoutResult =
  | { success: true; url: string }
  | { success: false; error: string };

export type CheckoutDeps = {
  getStripe: () => Stripe;
  getPendingRegistration: (id: string) => Promise<PendingRegistration | undefined>;
  getEvent: (slug: string) => Promise<Event | undefined>;
};

export async function createCheckoutSessionResult(
  deps: CheckoutDeps,
  pendingRegistrationId: string,
): Promise<CheckoutResult> {
  const pending = await deps.getPendingRegistration(pendingRegistrationId);
  if (!pending) return { success: false, error: "Pending registration not found" };

  const event = await deps.getEvent(pending.eventSlug);
  if (!event) return { success: false, error: "Event not found" };
  if (event.paymentModel === "free") return { success: false, error: "This event does not require online payment" };

  const amount = event.paymentModel === "deposit" ? event.depositAmount : event.fullPaymentAmount;
  const currency = event.depositCurrency;
  if (amount === null || amount <= 0) return { success: false, error: "Invalid payment amount" };

  const unitAmount = currency === "jpy" ? Math.round(amount) : Math.round(amount * 100);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const session = await deps.getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency,
          product_data: { name: event.title.en || event.title.zh },
          unit_amount: unitAmount,
        },
        quantity: 1,
      },
    ],
    success_url: `${siteUrl}/member?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/events/${event.slug}?payment=cancelled`,
    metadata: {
      pendingRegistrationId,
      eventSlug: event.slug,
      memberId: pending.memberId ?? "",
      paymentModel: event.paymentModel,
      amount: String(amount),
      currency,
    },
    expires_at: Math.floor((Date.now() + 30 * 60 * 1000) / 1000),
  });

  if (!session.url) return { success: false, error: "Stripe did not return a checkout URL" };
  return { success: true, url: session.url };
}

export async function createCheckoutSessionAction(formData: FormData): Promise<CheckoutResult> {
  const pendingRegistrationId = String(formData.get("pendingRegistrationId") ?? "").trim();
  if (!pendingRegistrationId) return { success: false, error: "Missing pendingRegistrationId" };
  return createCheckoutSessionResult(
    { getStripe: getStripeServer, getPendingRegistration: getPendingRegistrationById, getEvent },
    pendingRegistrationId,
  );
}
