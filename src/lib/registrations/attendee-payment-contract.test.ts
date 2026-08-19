import { describe, expect, it } from "vitest";
import type { Registration } from "@/lib/types";
import { normalizeRegistrationFinance } from "./finance";

describe("attendee registration payment contract", () => {
  it("preserves a confirmed attendee's Stripe payment facts when the settlement is normalized", () => {
    // Given: a confirmed attendee registration created by the existing Stripe webhook path.
    const registration: Registration = {
      id: "reg-attendee-1",
      eventSlug: "mammoth-weekend",
      memberId: "member-1",
      answers: { name: "Rider One" },
      consentGiven: true,
      contactEmail: "rider@example.com",
      contactName: "Rider One",
      contactPhone: "555-0100",
      status: "confirmed",
      finance: {
        depositAmount: 500,
        depositStatus: "paid",
        depositPaidAt: "2026-07-22T10:00:00.000Z",
        paymentMethod: "stripe",
        paymentCurrency: "usd",
        paymentNote: "checkout.session.completed",
        stripeCheckoutSessionId: "cs_test_attendee_1",
        stripePaymentIntentId: "pi_attendee_1",
        refundedAmount: 0,
        lodgingAssignment: "",
        finalAmount: 500,
        settlementAmount: 0,
        settlementStatus: "settled",
        settlementNote: "",
      },
      createdAt: "2026-07-22T10:00:00.000Z",
      updatedAt: "2026-07-22T10:00:00.000Z",
    };

    // When: the existing attendee finance contract is normalized for a read surface.
    const finance = normalizeRegistrationFinance(registration.finance);

    // Then: attendee payment facts retain their Stripe-owned values and settled balance.
    expect(finance).toEqual({
      depositAmount: 500,
      depositStatus: "paid",
      depositPaidAt: "2026-07-22T10:00:00.000Z",
      paymentMethod: "stripe",
      paymentCurrency: "usd",
      paymentNote: "checkout.session.completed",
      stripeCheckoutSessionId: "cs_test_attendee_1",
      stripePaymentIntentId: "pi_attendee_1",
      refundedAmount: 0,
      lodgingAssignment: "",
      finalAmount: 500,
      settlementAmount: 0,
      settlementStatus: "settled",
      settlementNote: "",
    });
  });
});
