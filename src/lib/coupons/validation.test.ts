import { describe, expect, it } from "vitest";
import { quoteCoupon } from "./validation";
import type { EventCoupon } from "./repository";

const coupon: EventCoupon = {
  code: "SNOW20",
  discountType: "percent",
  discountValue: 20,
  active: true,
  startsAt: null,
  expiresAt: null,
  maxRedemptions: 5,
  createdAt: "2026-07-28T00:00:00.000Z",
};

describe("quoteCoupon", () => {
  it("calculates a percentage discount", () => {
    expect(quoteCoupon(coupon, 120, 0)).toEqual({ code: "SNOW20", discountAmount: 24, finalAmount: 96 });
  });

  it("rejects an inactive or exhausted coupon", () => {
    expect(quoteCoupon({ ...coupon, active: false }, 120, 0)).toEqual({ error: "This coupon is inactive" });
    expect(quoteCoupon(coupon, 120, 5)).toEqual({ error: "This coupon has reached its redemption limit" });
  });
});
