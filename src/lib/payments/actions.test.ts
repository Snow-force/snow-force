import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/members/actions", () => ({
  getCurrentMemberAccount: vi.fn().mockResolvedValue(null),
}));

import type Stripe from "stripe";
import type { Event } from "@/lib/types";
import type { PendingRegistration } from "@/lib/registrations/pending-repository";
import { createCheckoutSessionResult } from "./actions";

const MEMBER_ID = "member-1";

function createEvent(overrides: Partial<Event>): Event {
  const defaults: Event = {
    slug: "test-event",
    status: "published",
    registrationState: "open",
    title: { en: "Test Event", zh: "测试活动" },
    eventDate: "2099-06-15",
    meetTime: "08:00",
    meetLocation: { en: "Mountain Lodge", zh: "山间小屋" },
    activityLocation: { en: "Big Bear", zh: "大熊湖" },
    locationUrl: "",
    coverImage: "",
    capacity: 0,
    registrationCount: 0,
    registrationCloseAt: "2099-06-14T23:59:59Z",
    requiresApproval: false,
    allowWaitlist: false,
    allowCancellation: true,
    feeAmount: "0",
    paymentModel: "deposit",
    depositAmount: 120,
    depositCurrency: "usd",
    fullPaymentAmount: null,
    paymentInstructions: { en: "", zh: "" },
    seoTitle: { en: "", zh: "" },
    seoDescription: { en: "", zh: "" },
    registrationQuestions: [],
    detailModules: [],
    merchantBoothProgram: null,
  };
  return { ...defaults, ...overrides };
}

function createPendingRegistration(overrides: Partial<PendingRegistration> = {}): PendingRegistration {
  const defaults: PendingRegistration = {
    id: "p1",
    eventSlug: "test-event",
    memberId: MEMBER_ID,
    answers: {},
    consentGiven: true,
    contactEmail: "tai@example.com",
    contactName: "Tai",
    contactPhone: "",
    tokenHash: "hash-1",
    expiresAt: "2099-01-01T00:00:00.000Z",
    createdAt: "2026-06-01T00:00:00.000Z",
  };
  return { ...defaults, ...overrides };
}

function fakeStripeFactory(sessionsCreate: ReturnType<typeof vi.fn>) {
  return { checkout: { sessions: { create: sessionsCreate } } } as unknown as Stripe;
}

describe("createCheckoutSessionResult", () => {
  it("returns error when pending registration is not found", async () => {
    const sessionsCreate = vi.fn();
    const fakeGetPending = vi.fn().mockResolvedValue(undefined);
    const fakeGetEvent = vi.fn();

    const result = await createCheckoutSessionResult(
      { getStripe: () => fakeStripeFactory(sessionsCreate), getPendingRegistration: fakeGetPending, getEvent: fakeGetEvent },
      "unknown-id",
      { memberMemberId: MEMBER_ID },
    );

    expect(result).toEqual({ success: false, error: "Pending registration not found" });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("rejects a pending registration owned by another member without leaking existence", async () => {
    const sessionsCreate = vi.fn();
    const pending = createPendingRegistration({ memberId: "someone-else" });
    const fakeGetPending = vi.fn().mockResolvedValue(pending);
    const fakeGetEvent = vi.fn();

    const result = await createCheckoutSessionResult(
      { getStripe: () => fakeStripeFactory(sessionsCreate), getPendingRegistration: fakeGetPending, getEvent: fakeGetEvent },
      pending.id,
      { memberMemberId: MEMBER_ID },
    );

    expect(result).toEqual({ success: false, error: "Pending registration not found" });
    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(fakeGetEvent).not.toHaveBeenCalled();
  });

  it("rejects a pending registration with no memberId", async () => {
    const sessionsCreate = vi.fn();
    const pending = createPendingRegistration({ memberId: null });
    const fakeGetPending = vi.fn().mockResolvedValue(pending);
    const fakeGetEvent = vi.fn();

    const result = await createCheckoutSessionResult(
      { getStripe: () => fakeStripeFactory(sessionsCreate), getPendingRegistration: fakeGetPending, getEvent: fakeGetEvent },
      pending.id,
      { memberMemberId: MEMBER_ID },
    );

    expect(result).toEqual({ success: false, error: "Pending registration not found" });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("rejects an expired pending registration", async () => {
    const sessionsCreate = vi.fn();
    const pending = createPendingRegistration({ expiresAt: "2020-01-01T00:00:00.000Z" });
    const fakeGetPending = vi.fn().mockResolvedValue(pending);
    const fakeGetEvent = vi.fn();

    const result = await createCheckoutSessionResult(
      { getStripe: () => fakeStripeFactory(sessionsCreate), getPendingRegistration: fakeGetPending, getEvent: fakeGetEvent },
      pending.id,
      { memberMemberId: MEMBER_ID, now: new Date("2099-06-10T00:00:00.000Z") },
    );

    expect(result).toEqual({ success: false, error: "Pending registration expired" });
    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(fakeGetEvent).not.toHaveBeenCalled();
  });

  it("returns error when event is free", async () => {
    const sessionsCreate = vi.fn();
    const pending = createPendingRegistration();
    const event = createEvent({ paymentModel: "free" });
    const fakeGetPending = vi.fn().mockResolvedValue(pending);
    const fakeGetEvent = vi.fn().mockResolvedValue(event);

    const result = await createCheckoutSessionResult(
      { getStripe: () => fakeStripeFactory(sessionsCreate), getPendingRegistration: fakeGetPending, getEvent: fakeGetEvent },
      pending.id,
      { memberMemberId: MEMBER_ID },
    );

    expect(result).toEqual({ success: false, error: "This event does not require online payment" });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("creates a checkout session for a deposit event in USD", async () => {
    const sessionsCreate = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/test" });
    const pending = createPendingRegistration();
    const event = createEvent({ paymentModel: "deposit", depositAmount: 120, depositCurrency: "usd" });
    const fakeGetPending = vi.fn().mockResolvedValue(pending);
    const fakeGetEvent = vi.fn().mockResolvedValue(event);

    const result = await createCheckoutSessionResult(
      { getStripe: () => fakeStripeFactory(sessionsCreate), getPendingRegistration: fakeGetPending, getEvent: fakeGetEvent },
      pending.id,
      { memberMemberId: MEMBER_ID },
    );

    expect(result).toEqual({ success: true, url: "https://checkout.stripe.com/test" });
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method_types: ["card"],
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              currency: "usd",
              unit_amount: 12000,
            }),
          }),
        ],
      }),
    );
  });

  it("applies a valid pending coupon before creating checkout", async () => {
    const sessionsCreate = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/coupon" });
    const pending = createPendingRegistration({ couponCode: "SNOW20" });
    const event = createEvent({ depositAmount: 120 });
    const coupon = { code: "SNOW20", discountType: "percent" as const, discountValue: 20, active: true, startsAt: null, expiresAt: null, maxRedemptions: null, createdAt: "2026-07-28T00:00:00.000Z" };

    await createCheckoutSessionResult(
      { getStripe: () => fakeStripeFactory(sessionsCreate), getPendingRegistration: vi.fn().mockResolvedValue(pending), getEvent: vi.fn().mockResolvedValue(event), getCoupon: vi.fn().mockResolvedValue(coupon), getCouponRedemptionCount: vi.fn().mockResolvedValue(0) },
      pending.id,
      { memberMemberId: MEMBER_ID },
    );

    expect(sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 9600 }) })],
      metadata: expect.objectContaining({ couponCode: "SNOW20", discountAmount: "24" }),
    }));
  });

  it("creates a checkout session for a full_prepay event in CNY", async () => {
    const sessionsCreate = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/cny-test" });
    const pending = createPendingRegistration();
    const event = createEvent({
      paymentModel: "full_prepay",
      depositAmount: null,
      depositCurrency: "cny",
      fullPaymentAmount: 399,
    });
    const fakeGetPending = vi.fn().mockResolvedValue(pending);
    const fakeGetEvent = vi.fn().mockResolvedValue(event);

    const result = await createCheckoutSessionResult(
      { getStripe: () => fakeStripeFactory(sessionsCreate), getPendingRegistration: fakeGetPending, getEvent: fakeGetEvent },
      pending.id,
      { memberMemberId: MEMBER_ID },
    );

    expect(result).toEqual({ success: true, url: "https://checkout.stripe.com/cny-test" });
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              currency: "cny",
              unit_amount: 39900,
            }),
          }),
        ],
      }),
    );
  });

  it("creates a checkout session for a full_prepay event in JPY (zero-decimal currency)", async () => {
    const sessionsCreate = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/jpy-test" });
    const pending = createPendingRegistration();
    const event = createEvent({
      paymentModel: "full_prepay",
      depositAmount: null,
      depositCurrency: "jpy",
      fullPaymentAmount: 12000,
    });
    const fakeGetPending = vi.fn().mockResolvedValue(pending);
    const fakeGetEvent = vi.fn().mockResolvedValue(event);

    const result = await createCheckoutSessionResult(
      { getStripe: () => fakeStripeFactory(sessionsCreate), getPendingRegistration: fakeGetPending, getEvent: fakeGetEvent },
      pending.id,
      { memberMemberId: MEMBER_ID },
    );

    expect(result).toEqual({ success: true, url: "https://checkout.stripe.com/jpy-test" });
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              currency: "jpy",
              unit_amount: 12000,
            }),
          }),
        ],
      }),
    );
  });

  it("returns error when depositAmount is null", async () => {
    const sessionsCreate = vi.fn();
    const pending = createPendingRegistration();
    const event = createEvent({ paymentModel: "deposit", depositAmount: null });
    const fakeGetPending = vi.fn().mockResolvedValue(pending);
    const fakeGetEvent = vi.fn().mockResolvedValue(event);

    const result = await createCheckoutSessionResult(
      { getStripe: () => fakeStripeFactory(sessionsCreate), getPendingRegistration: fakeGetPending, getEvent: fakeGetEvent },
      pending.id,
      { memberMemberId: MEMBER_ID },
    );

    expect(result).toEqual({ success: false, error: "Invalid payment amount" });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("returns error when depositAmount is zero", async () => {
    const sessionsCreate = vi.fn();
    const pending = createPendingRegistration();
    const event = createEvent({ paymentModel: "deposit", depositAmount: 0 });
    const fakeGetPending = vi.fn().mockResolvedValue(pending);
    const fakeGetEvent = vi.fn().mockResolvedValue(event);

    const result = await createCheckoutSessionResult(
      { getStripe: () => fakeStripeFactory(sessionsCreate), getPendingRegistration: fakeGetPending, getEvent: fakeGetEvent },
      pending.id,
      { memberMemberId: MEMBER_ID },
    );

    expect(result).toEqual({ success: false, error: "Invalid payment amount" });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});
