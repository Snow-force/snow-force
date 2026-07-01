import { describe, expect, it } from "vitest";

import { parseEventEditorInput } from "./validation";

const baseInput = {
  slug: "winter-day",
  capacity: "24",
  eventDate: "2026-12-03",
  meetTime: "10:00",
  registrationCloseAt: "2026-12-02T18:00",
  registrationQuestions: [],
  detailModules: [],
};

describe("event editor payment model validation", () => {
  it("accepts free model with null amounts", () => {
    const result = parseEventEditorInput({
      ...baseInput,
      paymentModel: "free",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.paymentModel).toBe("free");
    expect(result.data.depositAmount).toBeNull();
    expect(result.data.depositCurrency).toBe("usd");
    expect(result.data.fullPaymentAmount).toBeNull();
  });

  it("rejects deposit model with depositAmount=0", () => {
    const result = parseEventEditorInput({
      ...baseInput,
      paymentModel: "deposit",
      depositAmount: "0",
      depositCurrency: "usd",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error?.issues[0].path).toEqual(["depositAmount"]);
    expect(result.error?.issues[0].message).toBe(
      "Deposit amount must be greater than 0",
    );
  });

  it("accepts deposit model with depositAmount=120, depositCurrency=usd", () => {
    const result = parseEventEditorInput({
      ...baseInput,
      paymentModel: "deposit",
      depositAmount: "120",
      depositCurrency: "usd",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.paymentModel).toBe("deposit");
    expect(result.data.depositAmount).toBe(120);
    expect(result.data.depositCurrency).toBe("usd");
  });

  it("rejects full_prepay model with fullPaymentAmount=0", () => {
    const result = parseEventEditorInput({
      ...baseInput,
      paymentModel: "full_prepay",
      fullPaymentAmount: "0",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error?.issues[0].path).toEqual(["fullPaymentAmount"]);
    expect(result.error?.issues[0].message).toBe(
      "Full payment amount must be greater than 0",
    );
  });

  it("accepts full_prepay model with fullPaymentAmount=399, depositCurrency=cny", () => {
    const result = parseEventEditorInput({
      ...baseInput,
      paymentModel: "full_prepay",
      fullPaymentAmount: "399",
      depositCurrency: "cny",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.paymentModel).toBe("full_prepay");
    expect(result.data.fullPaymentAmount).toBe(399);
    expect(result.data.depositCurrency).toBe("cny");
  });

  it("coerces depositAmount and fullPaymentAmount to null for free model", () => {
    const result = parseEventEditorInput({
      ...baseInput,
      paymentModel: "free",
      depositAmount: "120",
      fullPaymentAmount: "399",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.paymentModel).toBe("free");
    expect(result.data.depositAmount).toBeNull();
    expect(result.data.fullPaymentAmount).toBeNull();
  });

  it("rejects invalid currency 'hkd'", () => {
    const result = parseEventEditorInput({
      ...baseInput,
      paymentModel: "free",
      depositCurrency: "hkd",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid paymentModel 'partial'", () => {
    const result = parseEventEditorInput({
      ...baseInput,
      paymentModel: "partial",
    });

    expect(result.success).toBe(false);
  });
});
