import { describe, expect, it } from "vitest";

import {
  applyRegistrationFinanceInput,
  calculateSettlementAmount,
  normalizeRegistrationFinance,
} from "./finance";

describe("registration finance", () => {
  it("calculates balance, refund, and even settlement amounts", () => {
    expect(calculateSettlementAmount(150, 180)).toBe(30);
    expect(calculateSettlementAmount(150, 120)).toBe(-30);
    expect(calculateSettlementAmount(150, 150)).toBe(0);
    expect(calculateSettlementAmount(null, 150)).toBeNull();
  });

  it("derives settlement status from deposit and final amounts", () => {
    expect(applyRegistrationFinanceInput(undefined, {
      depositAmount: 150,
      finalAmount: 180,
    }).settlementStatus).toBe("pending_balance");

    expect(applyRegistrationFinanceInput(undefined, {
      depositAmount: 150,
      finalAmount: 120,
    }).settlementStatus).toBe("pending_refund");

    expect(applyRegistrationFinanceInput(undefined, {
      depositAmount: 150,
      finalAmount: 150,
    }).settlementStatus).toBe("settled");
  });

  it("keeps historical registrations readable with default finance state", () => {
    expect(normalizeRegistrationFinance(undefined)).toEqual({
      depositAmount: null,
      depositStatus: "pending",
      depositPaidAt: "",
      paymentMethod: "",
      paymentCurrency: "",
      paymentNote: "",
      stripeCheckoutSessionId: "",
      stripePaymentIntentId: "",
      refundedAmount: 0,
      lodgingAssignment: "",
      finalAmount: null,
      settlementAmount: null,
      settlementStatus: "not_started",
      settlementNote: "",
    });
  });
});
