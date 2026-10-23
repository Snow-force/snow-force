"use server";
import "server-only";

import type Stripe from "stripe";
import type { Event } from "@/lib/types";
import type { PendingRegistration } from "@/lib/registrations/pending-repository";
import { getStripeServer } from "@/lib/payments/stripe-server";
import { comparePendingCheckout, completePendingCheckout, getPendingRegistrationById } from "@/lib/registrations/pending-repository";
import { hasActiveSelfRegistration, pendingParticipantIdentity } from "@/lib/registrations/participation";
import { getEvent } from "@/lib/events/repository";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { getCoupon, getCouponRedemptionCount } from "@/lib/coupons/repository";
import { quoteCoupon } from "@/lib/coupons/validation";
import { createRegistration, getRegistrationCountForEvent, getRegistrations } from "@/lib/registrations/repository";
import { hasRemainingCapacity, isEventOpen } from "@/lib/events/availability";
import { defaultRegistrationFinance } from "@/lib/registrations/finance";
import { createWaiverAcceptance } from "@/lib/registrations/waiver-repository";
import { revalidatePath } from "next/cache";
import type { CheckoutAttempt } from "./checkout-attempt";
import { fulfillCheckoutSession } from "./fulfillment";
import { releaseExpiredCheckoutHold } from "./checkout-reconciliation";

export type CheckoutResult =
  | { success: true; url: string; completed?: boolean }
  | { success: false; error: string };

export type CheckoutDeps = {
  getStripe: () => Stripe;
  getPendingRegistration: (id: string) => Promise<PendingRegistration | undefined>;
  getEvent: (slug: string) => Promise<Event | undefined>;
  compareCheckout?: typeof comparePendingCheckout;
  getRegistrations?: typeof getRegistrations;
  getRegistrationCount?: typeof getRegistrationCountForEvent;
  fulfill?: typeof fulfillCheckoutSession;
  getCoupon?: typeof getCoupon;
  getCouponRedemptionCount?: typeof getCouponRedemptionCount;
  releaseExpiredHold?: typeof releaseExpiredCheckoutHold;
};

export type CheckoutOptions = {
  /**
   * Member profile id of the authenticated caller. The pending registration must
   * belong to this member; otherwise we reject without disclosing existence.
   */
  memberMemberId: string;
  now?: Date;
};

export async function createCheckoutSessionResult(
  deps: CheckoutDeps,
  pendingRegistrationId: string,
  options: CheckoutOptions,
): Promise<CheckoutResult> {
  const pending = await deps.getPendingRegistration(pendingRegistrationId);
  // Same message for "missing" and "not yours" so we don't leak pending ids.
  if (!pending) return { success: false, error: "Pending registration not found" };

  if (!pending.memberId || pending.memberId !== options.memberMemberId) {
    return { success: false, error: "Pending registration not found" };
  }

  const now = options.now ?? new Date();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const existing = await (deps.getRegistrations ?? getRegistrations)(pending.eventSlug) ?? [];
  if ((pending.registrationKind !== "proxy" && hasActiveSelfRegistration(existing, pending.memberId)) || pending.fulfilledRegistrationId) {
    return { success: false, error: "You are already registered for this event" };
  }
  const compare = deps.compareCheckout ?? comparePendingCheckout;

  async function resume(attempt: CheckoutAttempt): Promise<CheckoutResult> {
    if (attempt.amount === 0) return { success: true, url: "", completed: true };
    const stripe = deps.getStripe();
    let session;
    if (attempt.sessionId) {
      session = await stripe.checkout.sessions.retrieve(attempt.sessionId);
    } else {
      // Stripe may prune idempotency keys after 24 hours. Never blindly recreate an
      // ambiguous request outside that window, even if we failed to save its ID.
      if (now.getTime() - Date.parse(attempt.createdAt) >= 23 * 60 * 60 * 1000) {
        return { success: false, error: "Payment needs verification. Please contact SnowForce before paying again." };
      }
      session = await stripe.checkout.sessions.create(attempt.params, { idempotencyKey: `registration-checkout-${attempt.id}` });
      const saved = await compare(pendingRegistrationId, pending!.tokenHash, attempt.id, { ...attempt, sessionId: session.id });
      if (!saved) return { success: false, error: "Payment status changed. Please check My Trips before trying again." };
    }
    if (session.payment_status === "paid") {
      const result = await (deps.fulfill ?? fulfillCheckoutSession)(session);
      if (result.status !== "confirmed") return { success: false, error: "Payment needs verification. Please contact SnowForce before paying again." };
      return { success: true, url: `${siteUrl}/member?payment=success&session_id=${encodeURIComponent(session.id)}` };
    }
    if (session.status === "complete") {
      return { success: true, url: `${siteUrl}/member?payment=success&session_id=${encodeURIComponent(session.id)}` };
    }
    if (session.status === "expired") {
      // Only Stripe's authoritative expired state permits a new attempt. Never a timer alone.
      if (attempt.sessionId) await (deps.releaseExpiredHold ?? releaseExpiredCheckoutHold)(pendingRegistrationId, attempt.id, attempt.sessionId);
      else await compare(pendingRegistrationId, pending!.tokenHash, attempt.id, null);
      return { success: false, error: "This checkout expired. Please submit your registration again to refresh it." };
    }
    if (session.status !== "open" || !session.url) return { success: false, error: "Stripe did not return a checkout URL" };
    return { success: true, url: session.url };
  }

  if (pending.checkoutAttempt) return resume(pending.checkoutAttempt);
  if (!Number.isFinite(Date.parse(pending.expiresAt)) || Date.parse(pending.expiresAt) <= now.getTime()) {
    return { success: false, error: "Pending registration expired" };
  }

  const event = await deps.getEvent(pending.eventSlug);
  if (!event) return { success: false, error: "Event not found" };
  if (event.paymentModel === "free") return { success: false, error: "This event does not require online payment" };

  const registrationCount = await (deps.getRegistrationCount ?? getRegistrationCountForEvent)(event.slug);
  if (!isEventOpen({ ...event, registrationCount })) return { success: false, error: "Event is not open for registration" };

  const amount = event.paymentModel === "deposit" ? event.depositAmount : event.fullPaymentAmount;
  const currency = event.depositCurrency;
  if (amount === null || amount <= 0) return { success: false, error: "Invalid payment amount" };

  let couponCode = "";
  let discountAmount = 0;
  let checkoutAmount = amount;
  if (pending.couponCode) {
    const coupon = await (deps.getCoupon ?? getCoupon)(pending.couponCode);
    if (!coupon) return { success: false, error: "Coupon code is invalid" };
    const redemptionCount = await (deps.getCouponRedemptionCount ?? getCouponRedemptionCount)(coupon.code);
    const quote = quoteCoupon(coupon, amount, redemptionCount, event.slug, now);
    if ("error" in quote) return { success: false, error: quote.error };
    couponCode = quote.code;
    discountAmount = quote.discountAmount;
    checkoutAmount = quote.finalAmount;
  }

  // A 100% coupon is completed in the authenticated action below. No Stripe
  // Checkout attempt is created for a zero-dollar order.
  if (checkoutAmount === 0) return { success: true, url: "", completed: true };

  const unitAmount = currency === "jpy" ? Math.round(checkoutAmount) : Math.round(checkoutAmount * 100);
  const attemptId = crypto.randomUUID();
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    locale: pending.preferredLanguage ?? "en",
    integration_identifier: "snowforce_checkout_qjvmsrta",
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
      checkoutAttemptId: attemptId,
      eventSlug: event.slug,
      memberId: pending.memberId ?? "",
      paymentModel: event.paymentModel,
      amount: String(checkoutAmount),
      currency,
      couponCode,
      discountAmount: String(discountAmount),
    },
    payment_intent_data: {
      metadata: {
        pendingRegistrationId,
        checkoutAttemptId: attemptId,
        eventSlug: event.slug,
        memberId: pending.memberId ?? "",
      },
    },
    // Stored with the attempt so retries carry exactly the same expiration.
    expires_at: Math.floor(now.getTime() / 1000) + 31 * 60,
  };
  const attempt: CheckoutAttempt = { id: attemptId, createdAt: now.toISOString(), params,
    amount: checkoutAmount, currency, paymentModel: event.paymentModel, couponCode, discountAmount };
  const claimed = await compare(pending.id, pending.tokenHash, null, attempt);
  if (!claimed) {
    const current = await deps.getPendingRegistration(pending.id);
    if (current?.checkoutAttempt && current.tokenHash === pending.tokenHash) return resume(current.checkoutAttempt);
    return { success: false, error: "Registration details changed. Please try again." };
  }
  return resume(attempt);
}

export async function createCheckoutSessionAction(formData: FormData): Promise<CheckoutResult> {
  const pendingRegistrationId = String(formData.get("pendingRegistrationId") ?? "").trim();
  if (!pendingRegistrationId) return { success: false, error: "Missing pendingRegistrationId" };

  const account = await getCurrentMemberAccount();
  if (!account?.profile) return { success: false, error: "Authentication required" };
  if (!account.emailConfirmed) return { success: false, error: "Verify your email before paying" };

  const recoverablePending = await getPendingRegistrationById(pendingRegistrationId);
  if (recoverablePending?.memberId === account.profile.id) {
    const committed = (await getRegistrations(recoverablePending.eventSlug)).find((row) => row.pendingRegistrationId === recoverablePending.id &&
      (row.bookerMemberId ?? row.memberId) === account.profile!.id && row.finance?.paymentMethod === "coupon");
    if (committed) {
      if (committed.status === "cancelled") return { success: false,error: "This registration has been cancelled. Submit a new registration." };
      if (recoverablePending.registrationKind !== "proxy" && recoverablePending.waiverTextEn && recoverablePending.waiverTextSha && recoverablePending.typedName) {
        await createWaiverAcceptance({ registrationId: committed.id,legalTextSnapshot: recoverablePending.waiverTextEn,waiverTextSha: recoverablePending.waiverTextSha,
          typedName: recoverablePending.typedName,handwrittenSignatureDataUrl: recoverablePending.handwrittenSignatureDataUrl ?? null,acceptedAt: new Date().toISOString() });
      }
      await completePendingCheckout(recoverablePending.id,committed.id);
      revalidatePath("/member");
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      return { success: true,url: `${siteUrl}/member?registration=${committed.approvalStatus === "pending" ? "approval-pending" : "confirmed"}`,completed: true };
    }
  }

  let result: CheckoutResult;
  try {
    result = await createCheckoutSessionResult(
    { getStripe: getStripeServer, getPendingRegistration: getPendingRegistrationById, getEvent, getCoupon, getCouponRedemptionCount },
    pendingRegistrationId,
    { memberMemberId: account.profile.id },
  );
  } catch {
    return { success: false, error: "Could not verify payment status. Please check My Trips before trying again." };
  }
  if (!result.success || !result.completed) return result;

  const pending = await getPendingRegistrationById(pendingRegistrationId);
  if (!pending || pending.memberId !== account.profile.id) return { success: false, error: "Pending registration not found" };
  const event = await getEvent(pending.eventSlug);
  if (!event || !pending.couponCode) return { success: false, error: "Coupon code is invalid" };
  const coupon = await getCoupon(pending.couponCode);
  if (!coupon) return { success: false, error: "Coupon code is invalid" };
  const amount = event.paymentModel === "deposit" ? event.depositAmount : event.fullPaymentAmount;
  if (amount === null) return { success: false, error: "Invalid payment amount" };
  const quote = quoteCoupon(coupon, amount, await getCouponRedemptionCount(coupon.code), event.slug);
  if ("error" in quote || quote.finalAmount !== 0) return { success: false, error: "Coupon is no longer valid" };
  if (pending.registrationKind !== "proxy" && hasActiveSelfRegistration(await getRegistrations(event.slug), pending.memberId!)) {
    return { success: false, error: "You are already registered for this event" };
  }
  const registrationCount = await getRegistrationCountForEvent(event.slug);
  if (!hasRemainingCapacity({ ...event, registrationCount })) return { success: false, error: "Event is not open for registration" };

  let registrationId: string;
  try {
    const created = await createRegistration({
      eventSlug: event.slug,
      ...pendingParticipantIdentity(pending),
      answers: pending.answers,
      consentGiven: pending.consentGiven,
      contactEmail: pending.contactEmail,
      contactName: pending.contactName,
      contactPhone: pending.contactPhone,
      finance: {
        ...defaultRegistrationFinance,
        depositAmount: 0,
        depositStatus: "waived",
        paymentMethod: "coupon",
        paymentNote: "100% coupon redemption",
        finalAmount: event.paymentModel === "full_prepay" ? 0 : null,
        settlementStatus: event.paymentModel === "full_prepay" ? "settled" : "not_started",
        couponCode: quote.code,
        discountAmount: quote.discountAmount,
      },
    });
    registrationId = created.registration.id;
    if (pending.registrationKind !== "proxy" && pending.waiverTextEn && pending.waiverTextSha && pending.typedName) {
      await createWaiverAcceptance({ registrationId: created.registration.id, legalTextSnapshot: pending.waiverTextEn, waiverTextSha: pending.waiverTextSha, typedName: pending.typedName, handwrittenSignatureDataUrl: pending.handwrittenSignatureDataUrl ?? null, acceptedAt: new Date().toISOString() });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("registrations_coupon_redemption_limit") || message.includes("registrations_coupon_code_used_once")) {
      return { success: false, error: "This coupon has reached its redemption limit" };
    }
    return { success: false, error: "Could not complete coupon registration" };
  }

  await completePendingCheckout(pending.id, registrationId);
  revalidatePath("/member");
  revalidatePath(`/events/${event.slug}`);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return { success: true, url: `${siteUrl}/member?registration=${pending.registrationKind === "proxy" && event.requiresApproval ? "approval-pending" : "confirmed"}`, completed: true };
}
