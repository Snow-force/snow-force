"use server";
import "server-only";

import type Stripe from "stripe";
import type { Event } from "@/lib/types";
import type { PendingRegistration } from "@/lib/registrations/pending-repository";
import { getStripeServer } from "@/lib/payments/stripe-server";
import { getPendingRegistrationById } from "@/lib/registrations/pending-repository";
import { getEvent } from "@/lib/events/repository";
import { getCurrentMemberAccount } from "@/lib/members/actions";
import { getCoupon, getCouponRedemptionCount } from "@/lib/coupons/repository";
import { quoteCoupon } from "@/lib/coupons/validation";
import { createRegistration, getRegistrationCountForEvent, getRegistrations } from "@/lib/registrations/repository";
import { deletePendingRegistration } from "@/lib/registrations/pending-repository";
import { hasRemainingCapacity } from "@/lib/events/availability";
import { defaultRegistrationFinance } from "@/lib/registrations/finance";
import { createWaiverAcceptance } from "@/lib/registrations/waiver-repository";
import { revalidatePath } from "next/cache";

export type CheckoutResult =
  | { success: true; url: string; completed?: boolean }
  | { success: false; error: string };

export type CheckoutDeps = {
  getStripe: () => Stripe;
  getPendingRegistration: (id: string) => Promise<PendingRegistration | undefined>;
  getEvent: (slug: string) => Promise<Event | undefined>;
  getCoupon?: typeof getCoupon;
  getCouponRedemptionCount?: typeof getCouponRedemptionCount;
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
  if (!Number.isNaN(Date.parse(pending.expiresAt)) && Date.parse(pending.expiresAt) <= now.getTime()) {
    return { success: false, error: "Pending registration expired" };
  }

  const event = await deps.getEvent(pending.eventSlug);
  if (!event) return { success: false, error: "Event not found" };
  if (event.paymentModel === "free") return { success: false, error: "This event does not require online payment" };

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

  if (checkoutAmount === 0) return { success: true, url: "", completed: true };

  const unitAmount = currency === "jpy" ? Math.round(checkoutAmount) : Math.round(checkoutAmount * 100);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const session = await deps.getStripe().checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
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
      amount: String(checkoutAmount),
      currency,
      couponCode,
      discountAmount: String(discountAmount),
    },
    expires_at: Math.floor((Date.now() + 30 * 60 * 1000) / 1000),
  });

  if (!session.url) return { success: false, error: "Stripe did not return a checkout URL" };
  return { success: true, url: session.url };
}

export async function createCheckoutSessionAction(formData: FormData): Promise<CheckoutResult> {
  const pendingRegistrationId = String(formData.get("pendingRegistrationId") ?? "").trim();
  if (!pendingRegistrationId) return { success: false, error: "Missing pendingRegistrationId" };

  const account = await getCurrentMemberAccount();
  if (!account?.profile) return { success: false, error: "Authentication required" };

  const result = await createCheckoutSessionResult(
    { getStripe: getStripeServer, getPendingRegistration: getPendingRegistrationById, getEvent, getCoupon, getCouponRedemptionCount },
    pendingRegistrationId,
    { memberMemberId: account.profile.id },
  );
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
  if ((await getRegistrations(event.slug)).some((registration) => registration.memberId === pending.memberId && registration.status !== "cancelled")) {
    return { success: false, error: "You are already registered for this event" };
  }
  const registrationCount = await getRegistrationCountForEvent(event.slug);
  if (!hasRemainingCapacity({ ...event, registrationCount })) return { success: false, error: "Event is not open for registration" };

  try {
    const created = await createRegistration({
      eventSlug: event.slug,
      memberId: pending.memberId,
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
    if (pending.waiverTextEn && pending.waiverTextSha && pending.typedName) {
      await createWaiverAcceptance({ registrationId: created.registration.id, legalTextSnapshot: pending.waiverTextEn, waiverTextSha: pending.waiverTextSha, typedName: pending.typedName, handwrittenSignatureDataUrl: pending.handwrittenSignatureDataUrl ?? null, acceptedAt: new Date().toISOString() });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("registrations_coupon_code_used_once")) return { success: false, error: "This coupon has already been redeemed" };
    return { success: false, error: "Could not complete coupon registration" };
  }

  await deletePendingRegistration(pending.id);
  revalidatePath("/member");
  revalidatePath(`/events/${event.slug}`);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return { success: true, url: `${siteUrl}/member?payment=success`, completed: true };
}
