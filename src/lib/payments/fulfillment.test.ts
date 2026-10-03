import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Event, Registration } from "@/lib/types";
import type { PendingRegistration } from "@/lib/registrations/pending-repository";
import type { FulfillmentDeps, PaidCheckoutSession } from "./fulfillment";
import { fulfillCheckoutSession } from "./fulfillment";
import { createDefaultReviewConfig } from "@/lib/reviews/config";

const pending: PendingRegistration = {
  id: "pending-1", eventSlug: "mammoth", memberId: "member-1", answers: {}, consentGiven: true,
  contactEmail: "lanfeng@example.com", contactName: "Lanfeng Sun", contactPhone: "",
  tokenHash: "token", expiresAt: "2099-01-01T00:00:00.000Z", createdAt: "2026-09-08T00:00:00.000Z",
  checkoutAttempt: {
    id: "attempt-1", createdAt: "2026-09-08T00:00:00.000Z", amount: 99, currency: "usd",
    paymentModel: "deposit", couponCode: "", discountAmount: 0,
    sessionId: "cs_live_1",
    params: { mode: "payment", success_url: "https://snow-force.com/member", cancel_url: "https://snow-force.com/events/mammoth", line_items: [] },
  },
};

const event: Event = {
  slug: "mammoth", status: "published", registrationState: "open", title: { en: "Mammoth", zh: "猛犸山" },
  eventDate: "2099-01-01", meetTime: "08:00", meetLocation: { en: "Lodge", zh: "集合点" },
  activityLocation: { en: "Mammoth", zh: "猛犸山" }, locationUrl: "", coverImage: "", capacity: 20,
  registrationCount: 0, registrationCloseAt: "2098-12-31T00:00:00.000Z", requiresApproval: false,
  allowWaitlist: false, allowCancellation: true, feeAmount: "99", paymentModel: "deposit",
  depositAmount: 99, depositCurrency: "usd", fullPaymentAmount: null, paymentInstructions: { en: "", zh: "" },
  seoTitle: { en: "", zh: "" }, seoDescription: { en: "", zh: "" }, registrationQuestions: [], detailModules: [], merchantBoothProgram: null,
  waiverTextEn: null, waiverTextSha: null, reviewConfig: createDefaultReviewConfig(),
};

function paidSession(): PaidCheckoutSession {
  return {
    id: "cs_live_1", status: "complete", payment_status: "paid", amount_total: 9900, currency: "usd",
    payment_intent: "pi_live_1",
    metadata: { pendingRegistrationId: pending.id, checkoutAttemptId: "attempt-1", eventSlug: "mammoth", memberId: "member-1" },
  };
}

function registration(): Registration & { finance: NonNullable<Registration["finance"]> } {
  return {
    id: "registration-1", eventSlug: "mammoth", memberId: "member-1", answers: {}, consentGiven: true,
    contactEmail: "lanfeng@example.com", contactName: "Lanfeng Sun", contactPhone: "", status: "confirmed",
    attendanceStatus: "unmarked", attendanceSource: null, attendanceMarkedAt: null,
    finance: {
      depositAmount: 99, depositStatus: "paid", depositPaidAt: "2026-09-08T00:00:00.000Z", paymentMethod: "stripe",
      paymentCurrency: "usd", paymentNote: "", stripeCheckoutSessionId: "cs_live_1", stripePaymentIntentId: "pi_live_1",
      refundedAmount: 0, lodgingAssignment: "", finalAmount: null, settlementAmount: null,
      settlementStatus: "not_started", settlementNote: "", discountAmount: 0,
    },
    createdAt: "2026-09-08T00:00:00.000Z", updatedAt: "2026-09-08T00:00:00.000Z",
  };
}

function dependencies(registrations: Registration[]): FulfillmentDeps {
  return {
    getPending: vi.fn().mockResolvedValue(pending), getEvent: vi.fn().mockResolvedValue(event),
    getRegistrations: vi.fn().mockImplementation(async () => registrations), countRegistrations: vi.fn().mockResolvedValue(registrations.length),
    createRegistration: vi.fn().mockImplementation(async () => {
      const created = registration();
      registrations.push(created);
      return { success: true as const, registration: created };
    }),
    createWaiver: vi.fn(), completePending: vi.fn(),
  };
}

describe("fulfillCheckoutSession", () => {
  it("creates one registration when the same signed Stripe session is delivered twice", async () => {
    const registrations: Registration[] = [];
    const deps = dependencies(registrations);

    await expect(fulfillCheckoutSession(paidSession(), deps)).resolves.toMatchObject({ status: "confirmed", registrationId: "registration-1" });
    await expect(fulfillCheckoutSession(paidSession(), deps)).resolves.toMatchObject({ status: "confirmed", registrationId: "registration-1" });

    expect(deps.createRegistration).toHaveBeenCalledTimes(1);
    expect(deps.completePending).toHaveBeenCalledWith("pending-1", "registration-1");
  });

  it("does not attach a second payment to an existing member registration", async () => {
    const existing = registration();
    existing.finance.stripeCheckoutSessionId = "cs_live_other";
    existing.finance.stripePaymentIntentId = "pi_live_other";
    const deps = dependencies([existing]);

    await expect(fulfillCheckoutSession(paidSession(), deps)).rejects.toThrow("duplicate_payment_requires_review");
    expect(deps.createRegistration).not.toHaveBeenCalled();
    expect(deps.completePending).not.toHaveBeenCalled();
  });
});
