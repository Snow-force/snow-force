import "server-only";
import type Stripe from "stripe";
import { getEventAdmin } from "@/lib/events/repository";
import { getPendingRegistrationById, completePendingCheckout } from "@/lib/registrations/pending-repository";
import { createRegistration, getRegistrations, getRegistrationCountForEvent } from "@/lib/registrations/repository";
import { createWaiverAcceptance } from "@/lib/registrations/waiver-repository";
import { defaultRegistrationFinance } from "@/lib/registrations/finance";
import type { Registration } from "@/lib/types";
import { belongsToBooker, hasActiveSelfRegistration, pendingParticipantIdentity } from "@/lib/registrations/participation";
import { flagPaidPendingForReview } from "@/lib/registrations/payment-review";

export type PaidCheckoutSession = Pick<Stripe.Checkout.Session,
  "id" | "payment_status" | "status" | "amount_total" | "currency" | "payment_intent" | "metadata">;
export type FulfillmentDeps = {
  getPending: typeof getPendingRegistrationById;
  getEvent: typeof getEventAdmin;
  getRegistrations: typeof getRegistrations;
  countRegistrations: typeof getRegistrationCountForEvent;
  createRegistration: typeof createRegistration;
  createWaiver: typeof createWaiverAcceptance;
  completePending: typeof completePendingCheckout;
  flagPaidReview?: typeof flagPaidPendingForReview;
};
export const fulfillmentDeps: FulfillmentDeps = {
  getPending: getPendingRegistrationById, getEvent: getEventAdmin, getRegistrations,
  countRegistrations: getRegistrationCountForEvent, createRegistration,
  createWaiver: createWaiverAcceptance, completePending: completePendingCheckout,
  flagPaidReview: flagPaidPendingForReview,
};

function registrationPaymentStatus(registration: Registration) {
  return registration.status === "cancelled" ? "review" as const
    : registration.approvalStatus === "pending" ? "approval_pending" as const : "confirmed" as const;
}

/** Called by both signed webhooks and the authenticated return page. Never overwrites a payment. */
export async function fulfillCheckoutSession(session: PaidCheckoutSession, deps = fulfillmentDeps) {
  if (session.payment_status !== "paid" || session.status !== "complete") return { status: "processing" as const };
  const pendingId = session.metadata?.pendingRegistrationId;
  if (!pendingId) throw new Error("checkout_pending_reference_missing");
  const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!intentId) throw new Error("checkout_payment_reference_missing");
  const pending = await deps.getPending(pendingId);
  const eventSlug = pending?.eventSlug ?? session.metadata?.eventSlug;
  if (!eventSlug) throw new Error("checkout_event_reference_missing");
  const registrations = await deps.getRegistrations(eventSlug);
  const samePayment = (r: Registration) => r.finance?.stripeCheckoutSessionId === session.id && r.finance?.stripePaymentIntentId === intentId;
  let registration = registrations.find(samePayment);
  if (!pending) {
    if (!registration) throw new Error("paid_checkout_pending_missing");
    return { status: registrationPaymentStatus(registration), registrationId: registration.id };
  }
  if (!pending.memberId || session.metadata?.memberId !== pending.memberId || session.metadata?.eventSlug !== pending.eventSlug) {
    throw new Error("checkout_owner_mismatch");
  }
  const attempt = pending.checkoutAttempt;
  if (attempt && (session.metadata?.checkoutAttemptId !== attempt.id || (attempt.sessionId && attempt.sessionId !== session.id))) {
    throw new Error("checkout_attempt_mismatch");
  }
  const event = await deps.getEvent(pending.eventSlug);
  if (!event) throw new Error("paid_checkout_event_missing");
  // New checkouts use the immutable DB quote. Legacy sessions use DB event pricing.
  const currency = attempt?.currency ?? event.depositCurrency;
  const model = attempt?.paymentModel ?? event.paymentModel;
  const base = model === "deposit" ? event.depositAmount : event.fullPaymentAmount;
  const amount = session.amount_total;
  if (amount === null || amount <= 0 || session.currency !== currency || model === "free") throw new Error("checkout_amount_invalid");
  const paid = currency === "jpy" ? amount : amount / 100;
  if (attempt ? paid !== attempt.amount : (base === null || base <= 0 || (pending.couponCode ? paid > base : paid !== base))) {
    throw new Error("checkout_amount_mismatch");
  }
  if (registration && (!belongsToBooker(registration, pending.memberId) ||
    (pending.registrationKind === "proxy" && registration.pendingRegistrationId !== pending.id))) throw new Error("checkout_owner_mismatch");
  if (!registration) {
    if ((pending.registrationKind !== "proxy" && hasActiveSelfRegistration(registrations, pending.memberId)) || pending.fulfilledRegistrationId) {
      await deps.flagPaidReview?.(pending.id);
      throw new Error("duplicate_payment_requires_review");
    }
    if (event.capacity > 0 && await deps.countRegistrations(event.slug) >= event.capacity) {
      await deps.flagPaidReview?.(pending.id);
      throw new Error("paid_checkout_capacity_requires_review");
    }
    try {
      registration = (await deps.createRegistration({
        eventSlug: pending.eventSlug, ...pendingParticipantIdentity(pending), answers: pending.answers,
        consentGiven: pending.consentGiven, contactEmail: pending.contactEmail,
        contactName: pending.contactName, contactPhone: pending.contactPhone,
        finance: {
          ...defaultRegistrationFinance, depositStatus: "paid", depositAmount: paid,
          depositPaidAt: new Date().toISOString(), paymentMethod: "stripe", paymentCurrency: currency,
          stripeCheckoutSessionId: session.id, stripePaymentIntentId: intentId,
          finalAmount: model === "full_prepay" ? paid : null,
          settlementAmount: model === "full_prepay" ? 0 : null,
          settlementStatus: model === "full_prepay" ? "settled" : "not_started",
          couponCode: attempt?.couponCode ?? pending.couponCode ?? "",
          discountAmount: attempt?.discountAmount ?? (pending.couponCode && base ? Math.round((base - paid) * 100) / 100 : 0),
        },
      })).registration;
    } catch (error) {
      // The DB's unique member/event constraint may have been won by another delivery.
      // Only the SAME payment is a safe retry; never attach this payment to another order.
      registration = (await deps.getRegistrations(eventSlug)).find(samePayment);
      if (!registration) {
        await deps.flagPaidReview?.(pending.id);
        throw error;
      }
    }
  }
  if (pending.registrationKind !== "proxy" && pending.waiverTextEn && pending.waiverTextSha && pending.typedName) {
    await deps.createWaiver({ registrationId: registration.id, legalTextSnapshot: pending.waiverTextEn,
      waiverTextSha: pending.waiverTextSha, typedName: pending.typedName,
      handwrittenSignatureDataUrl: pending.handwrittenSignatureDataUrl ?? null, acceptedAt: new Date().toISOString() });
  }
  await deps.completePending(pending.id, registration.id);
  return { status: registrationPaymentStatus(registration), registrationId: registration.id };
}
