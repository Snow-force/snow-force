import { describe, it, expect } from "vitest";
import { manualFinanceUpdate } from "./manual-finance";
import { defaultRegistrationFinance } from "./finance";

describe("manual finance updates", () => {
  it("preserves Stripe payment facts when disabled status is absent or tampered with", () => {
    const form = new FormData();
    form.set("settlementStatus", "settled");
    const finance = { ...defaultRegistrationFinance, paymentMethod: "stripe", depositStatus: "paid" as const, depositAmount: 99 };
    expect(manualFinanceUpdate(finance, form)).toEqual({ settlementStatus: "settled" });
    form.set("depositStatus", "pending"); form.set("depositAmount", "0");
    expect(manualFinanceUpdate(finance, form)).toEqual({ settlementStatus: "settled" });
  });
  it("allows valid manual payments and ignores absent or invalid fields", () => {
    const form = new FormData();
    form.set("depositAmount", "99"); form.set("depositStatus", "paid");
    expect(manualFinanceUpdate(defaultRegistrationFinance, form)).toMatchObject({ depositAmount: 99, depositStatus: "paid" });
    form.set("depositAmount", "-1"); form.set("depositStatus", "bad"); form.set("settlementStatus", "bad");
    expect(manualFinanceUpdate(defaultRegistrationFinance, form)).toEqual({});
  });
});
