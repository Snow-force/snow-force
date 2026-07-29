import type { EventCoupon } from "./repository";

export type CouponQuote = { code: string; discountAmount: number; finalAmount: number };

export function quoteCoupon(
  coupon: EventCoupon,
  amount: number,
  redemptionCount: number,
  eventSlug: string,
  now = new Date(),
): CouponQuote | { error: string } {
  if (coupon.eventSlug !== eventSlug) return { error: "This coupon is not valid for this event" };
  if (!coupon.active) return { error: "This coupon is inactive" };
  if (coupon.startsAt && Date.parse(coupon.startsAt) > now.getTime()) return { error: "This coupon is not active yet" };
  if (coupon.expiresAt && Date.parse(coupon.expiresAt) <= now.getTime()) return { error: "This coupon has expired" };
  if (coupon.maxRedemptions !== null && redemptionCount >= coupon.maxRedemptions) return { error: "This coupon has reached its redemption limit" };

  const rawDiscount = coupon.discountType === "percent"
    ? amount * (coupon.discountValue / 100)
    : coupon.discountValue;
  const discountAmount = Math.min(amount, Math.round(rawDiscount * 100) / 100);
  const finalAmount = Math.round((amount - discountAmount) * 100) / 100;
  return { code: coupon.code, discountAmount, finalAmount };
}
