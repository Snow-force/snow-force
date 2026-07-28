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

export type CheckoutResult =
  | { success: true; url: string }
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
    const quote = quoteCoupon(coupon, amount, redemptionCount, now);
    if ("error" in quote) return { success: false, error: quote.error };
    couponCode = quote.code;
    discountAmount = quote.discountAmount;
    checkoutAmount = quote.finalAmount;
  }

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

  return createCheckoutSessionResult(
    { getStripe: getStripeServer, getPendingRegistration: getPendingRegistrationById, getEvent, getCoupon, getCouponRedemptionCount },
    pendingRegistrationId,
    { memberMemberId: account.profile.id },
  );
}
