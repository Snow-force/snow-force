import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type Stripe from "stripe";
import type { Event } from "@/lib/types";
import type { PendingRegistration } from "@/lib/registrations/pending-repository";
import { createCheckoutSessionResult } from "./actions";

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
  };
  return { ...defaults, ...overrides };
}

function createPendingRegistration(overrides: Partial<PendingRegistration> = {}): PendingRegistration {
  const defaults: PendingRegistration = {
    id: "p1",
    eventSlug: "test-event",
    memberId: "member-1",
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

describe("createCheckoutSessionResult", () => {
  it("returns error when pending registration is not found", async () => {
    const sessionsCreate = vi.fn();
    const fakeStripe = { checkout: { sessions: { create: sessionsCreate } } } as unknown as Stripe;
    const fakeGetPending = vi.fn().mockResolvedValue(undefined);
    const fakeGetEvent = vi.fn();

    const result = await createCheckoutSessionResult(
      { getStripe: () => fakeStripe, getPendingRegistration: fakeGetPending, getEvent: fakeGetEvent },
      "unknown-id",
    );

    expect(result).toEqual({ success: false, error: "Pending registration not found" });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("returns error when event is free", async () => {
    const sessionsCreate = vi.fn();
    const fakeStripe = { checkout: { sessions: { create: sessionsCreate } } } as unknown as Stripe;
    const pending = createPendingRegistration();
    const event = createEvent({ paymentModel: "free" });
    const fakeGetPending = vi.fn().mockResolvedValue(pending);
    const fakeGetEvent = vi.fn().mockResolvedValue(event);

    const result = await createCheckoutSessionResult(
      { getStripe: () => fakeStripe, getPendingRegistration: fakeGetPending, getEvent: fakeGetEvent },
      pending.id,
    );

    expect(result).toEqual({ success: false, error: "This event does not require online payment" });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("creates a checkout session for a deposit event in USD", async () => {
    const sessionsCreate = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/test" });
    const fakeStripe = { checkout: { sessions: { create: sessionsCreate } } } as unknown as Stripe;
    const pending = createPendingRegistration();
    const event = createEvent({ paymentModel: "deposit", depositAmount: 120, depositCurrency: "usd" });
    const fakeGetPending = vi.fn().mockResolvedValue(pending);
    const fakeGetEvent = vi.fn().mockResolvedValue(event);

    const result = await createCheckoutSessionResult(
      { getStripe: () => fakeStripe, getPendingRegistration: fakeGetPending, getEvent: fakeGetEvent },
      pending.id,
    );

    expect(result).toEqual({ success: true, url: "https://checkout.stripe.com/test" });
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
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

  it("creates a checkout session for a full_prepay event in CNY", async () => {
    const sessionsCreate = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/cny-test" });
    const fakeStripe = { checkout: { sessions: { create: sessionsCreate } } } as unknown as Stripe;
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
      { getStripe: () => fakeStripe, getPendingRegistration: fakeGetPending, getEvent: fakeGetEvent },
      pending.id,
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
    const fakeStripe = { checkout: { sessions: { create: sessionsCreate } } } as unknown as Stripe;
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
      { getStripe: () => fakeStripe, getPendingRegistration: fakeGetPending, getEvent: fakeGetEvent },
      pending.id,
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
    const fakeStripe = { checkout: { sessions: { create: sessionsCreate } } } as unknown as Stripe;
    const pending = createPendingRegistration();
    const event = createEvent({ paymentModel: "deposit", depositAmount: null });
    const fakeGetPending = vi.fn().mockResolvedValue(pending);
    const fakeGetEvent = vi.fn().mockResolvedValue(event);

    const result = await createCheckoutSessionResult(
      { getStripe: () => fakeStripe, getPendingRegistration: fakeGetPending, getEvent: fakeGetEvent },
      pending.id,
    );

    expect(result).toEqual({ success: false, error: "Invalid payment amount" });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("returns error when depositAmount is zero", async () => {
    const sessionsCreate = vi.fn();
    const fakeStripe = { checkout: { sessions: { create: sessionsCreate } } } as unknown as Stripe;
    const pending = createPendingRegistration();
    const event = createEvent({ paymentModel: "deposit", depositAmount: 0 });
    const fakeGetPending = vi.fn().mockResolvedValue(pending);
    const fakeGetEvent = vi.fn().mockResolvedValue(event);

    const result = await createCheckoutSessionResult(
      { getStripe: () => fakeStripe, getPendingRegistration: fakeGetPending, getEvent: fakeGetEvent },
      pending.id,
    );

    expect(result).toEqual({ success: false, error: "Invalid payment amount" });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});
