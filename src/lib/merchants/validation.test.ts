import { describe, expect, it } from "vitest";

import {
  parseMerchantApplicationApproval,
  parseMerchantApplicationReview,
  parseMerchantApplicationSubmission,
  parseMerchantApplicationWithdrawal,
  parseMerchantBoothAllocation,
  parseMerchantInstructionsUpdate,
  parseMerchantManualPayment,
} from "./validation";

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

describe("parseMerchantApplicationSubmission", () => {
  it("accepts a complete application payload and flags it as free of forged keys", () => {
    const result = parseMerchantApplicationSubmission(
      form({
        eventSlug: "mammoth-weekend",
        requestedPlanId: "plan-standard",
        businessName: "Summit Goods",
        contactName: "Booth Owner",
        contactEmail: "booth@example.com",
        contactPhone: "555-0100",
        category: "Equipment",
        description: "Wax and accessories",
      }),
    );

    expect(result).toMatchObject({
      success: true,
      ignoredKeys: [],
    });
    if (!result.success) return;
    expect(result.data.businessName).toBe("Summit Goods");
    expect(result.data.contactEmail).toBe("booth@example.com");
  });

  it("normalizes whitespace and lowercases the contact email", () => {
    const result = parseMerchantApplicationSubmission(
      form({
        eventSlug: "mammoth-weekend",
        requestedPlanId: "plan-standard",
        businessName: " Summit Goods ",
        contactName: " Booth Owner ",
        contactEmail: " BOOTH@example.com ",
        contactPhone: " 555-0100 ",
        category: " Equipment ",
        description: " Wax and accessories ",
      }),
    );

    expect(result).toMatchObject({ success: true });
    if (!result.success) return;
    expect(result.data).toEqual({
      eventSlug: "mammoth-weekend",
      requestedPlanId: "plan-standard",
      businessName: "Summit Goods",
      contactName: "Booth Owner",
      contactEmail: "booth@example.com",
      contactPhone: "555-0100",
      category: "Equipment",
      description: "Wax and accessories",
    });
  });

  it("rejects a missing or invalid contact email", () => {
    const result = parseMerchantApplicationSubmission(
      form({
        eventSlug: "mammoth-weekend",
        requestedPlanId: "plan-standard",
        businessName: "Summit Goods",
        contactName: "Booth Owner",
        contactEmail: "not-an-email",
        category: "Equipment",
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors?.contactEmail).toBeDefined();
  });

  it("rejects a missing business name and category", () => {
    const result = parseMerchantApplicationSubmission(
      form({
        eventSlug: "mammoth-weekend",
        requestedPlanId: "plan-standard",
        businessName: "",
        contactName: "Booth Owner",
        contactEmail: "booth@example.com",
        category: "   ",
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors?.businessName).toBeDefined();
    expect(result.fieldErrors?.category).toBeDefined();
  });

  it("flags forged client-side status, amount, currency, and identity fields", () => {
    const result = parseMerchantApplicationSubmission(
      form({
        eventSlug: "mammoth-weekend",
        requestedPlanId: "plan-standard",
        businessName: "Summit Goods",
        contactName: "Booth Owner",
        contactEmail: "booth@example.com",
        category: "Equipment",
        status: "approved",
        quotedAmount: "0",
        quotedCurrency: "usd",
        merchantProfileId: "forged-profile",
        boothProgramId: "forged-program",
        id: "forged-id",
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.ignoredKeys).toEqual(
      expect.arrayContaining([
        "status",
        "quotedAmount",
        "quotedCurrency",
        "merchantProfileId",
        "boothProgramId",
        "id",
      ]),
    );
  });

  it("rejects an unknown event slug and unknown booth plan id", () => {
    const result = parseMerchantApplicationSubmission(
      form({
        eventSlug: "",
        requestedPlanId: "   ",
        businessName: "Summit Goods",
        contactName: "Booth Owner",
        contactEmail: "booth@example.com",
        category: "Equipment",
      }),
    );

    expect(result.success).toBe(false);
  });
});

describe("parseMerchantApplicationWithdrawal", () => {
  it("accepts a valid application id and ignores forged keys", () => {
    const result = parseMerchantApplicationWithdrawal(
      form({ applicationId: "app-1", status: "withdrawn" }),
    );

    expect(result).toMatchObject({ success: true });
    if (!result.success) return;
    expect(result.data.applicationId).toBe("app-1");
    expect(result.ignoredKeys).toEqual(expect.arrayContaining(["status"]));
  });

  it("rejects an empty application id", () => {
    expect(parseMerchantApplicationWithdrawal(form({ applicationId: "" }))).toEqual({
      success: false,
      error: "Application id is required.",
      ignoredKeys: [],
    });
  });
});

describe("parseMerchantApplicationReview", () => {
  it("accepts an under_review decision without a rejection reason", () => {
    const result = parseMerchantApplicationReview(
      form({ applicationId: "app-1", decision: "under_review" }),
    );

    expect(result).toMatchObject({ success: true });
    if (!result.success) return;
    expect(result.data).toEqual({ applicationId: "app-1", decision: "under_review", rejectionReason: "" });
  });

  it("rejects a reject decision without a meaningful rejection reason", () => {
    const result = parseMerchantApplicationReview(
      form({ applicationId: "app-1", decision: "reject", rejectionReason: "no" }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors?.rejectionReason).toBeDefined();
  });

  it("flags forged payment and amount keys without rejecting the review", () => {
    const result = parseMerchantApplicationReview(
      form({
        applicationId: "app-1",
        decision: "under_review",
        amount: "9999",
        currency: "usd",
        method: "wire",
        paidAt: "2026-07-22T10:00:00.000Z",
        quotedAmount: "100",
        quotedCurrency: "usd",
      }),
    );

    expect(result).toMatchObject({ success: true });
    if (!result.success) return;
    expect(result.ignoredKeys).toEqual(
      expect.arrayContaining(["amount", "currency", "method", "paidAt", "quotedAmount", "quotedCurrency"]),
    );
  });

  it("rejects an unknown decision value", () => {
    const result = parseMerchantApplicationReview(
      form({ applicationId: "app-1", decision: "random" }),
    );

    expect(result.success).toBe(false);
  });
});

describe("parseMerchantApplicationApproval", () => {
  it("accepts a valid application id and ignores forged keys", () => {
    const result = parseMerchantApplicationApproval(
      form({
        applicationId: "app-1",
        boothId: "forged-booth",
        boothPlanId: "forged-plan",
        quotedAmount: "0",
        quotedCurrency: "usd",
        status: "approved",
        amount: "0",
      }),
    );

    expect(result).toMatchObject({ success: true });
    if (!result.success) return;
    expect(result.data.applicationId).toBe("app-1");
    expect(result.ignoredKeys).toEqual(
      expect.arrayContaining([
        "boothId",
        "boothPlanId",
        "quotedAmount",
        "quotedCurrency",
        "status",
        "amount",
      ]),
    );
  });

  it("rejects an empty application id", () => {
    expect(parseMerchantApplicationApproval(form({ applicationId: "" }))).toEqual({
      success: false,
      error: "Application id is required.",
      ignoredKeys: [],
    });
  });
});

describe("parseMerchantBoothAllocation", () => {
  it("accepts a selected booth and ignores forged allocation facts", () => {
    const result = parseMerchantBoothAllocation(
      form({
        applicationId: "app-1",
        boothId: "booth-1",
        boothPlanId: "forged-plan",
        amount: "100",
        currency: "usd",
        method: "wire",
        reference: "wire-1",
        paidAt: "2026-07-22T10:00:00.000Z",
        status: "paid",
        quotedAmount: "0",
        quotedCurrency: "usd",
      }),
    );

    expect(result).toMatchObject({ success: true });
    if (!result.success) return;
    expect(result.data).toEqual({ applicationId: "app-1", boothId: "booth-1" });
    expect(result.ignoredKeys).toEqual(
      expect.arrayContaining([
        "boothPlanId",
        "amount",
        "currency",
        "method",
        "reference",
        "paidAt",
        "status",
        "quotedAmount",
        "quotedCurrency",
      ]),
    );
  });

  it("rejects an empty application id or booth id", () => {
    expect(parseMerchantBoothAllocation(form({ applicationId: "", boothId: "" }))).toEqual({
      success: false,
      error: "Select an application and matching booth.",
      ignoredKeys: [],
    });
  });
});

describe("parseMerchantInstructionsUpdate", () => {
  it("accepts bilingual instructions and ignores payment and booth keys", () => {
    const result = parseMerchantInstructionsUpdate(
      form({
        programId: "program-1",
        paymentInstructionsEn: "Wire staff offline.",
        paymentInstructionsZh: "请线下向工作人员付款。",
        amount: "100",
        currency: "usd",
        method: "wire",
        reference: "wire-1",
        paidAt: "2026-07-22T10:00:00.000Z",
        applicationId: "app-1",
        boothId: "booth-1",
      }),
    );

    expect(result).toMatchObject({ success: true });
    if (!result.success) return;
    expect(result.ignoredKeys).toEqual(
      expect.arrayContaining(["amount", "currency", "method", "reference", "paidAt", "applicationId", "boothId"]),
    );
  });

  it("rejects an empty program id", () => {
    const result = parseMerchantInstructionsUpdate(
      form({
        programId: "",
        paymentInstructionsEn: "Wire staff offline.",
        paymentInstructionsZh: "请线下向工作人员付款。",
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors?.programId).toBeDefined();
  });

  it("rejects a payload with no English or Chinese instructions", () => {
    const result = parseMerchantInstructionsUpdate(
      form({
        programId: "program-1",
        paymentInstructionsEn: "",
        paymentInstructionsZh: "",
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors?.paymentInstructionsEn).toBeDefined();
  });
});

describe("parseMerchantManualPayment", () => {
  it("accepts a complete manual payment payload and flags forged keys", () => {
    const result = parseMerchantManualPayment(
      form({
        applicationId: "app-1",
        method: "bank_transfer",
        reference: "wire-001",
        note: "Received by staff",
        paidAt: "2026-07-22T10:00:00.000Z",
        amount: "9999",
        currency: "cny",
        status: "confirmed",
        boothId: "booth-1",
        boothPlanId: "plan-1",
        quotedAmount: "100",
        quotedCurrency: "usd",
      }),
    );

    expect(result).toMatchObject({ success: true });
    if (!result.success) return;
    expect(result.ignoredKeys).toEqual(
      expect.arrayContaining([
        "amount",
        "currency",
        "status",
        "boothId",
        "boothPlanId",
        "quotedAmount",
        "quotedCurrency",
      ]),
    );
  });

  it("rejects an empty method, reference, and paid-at", () => {
    const result = parseMerchantManualPayment(
      form({ applicationId: "app-1", method: "", reference: "", paidAt: "" }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors?.method).toBeDefined();
    expect(result.fieldErrors?.reference).toBeDefined();
    expect(result.fieldErrors?.paidAt).toBeDefined();
  });

  it("rejects an invalid paid-at date", () => {
    const result = parseMerchantManualPayment(
      form({
        applicationId: "app-1",
        method: "bank_transfer",
        reference: "wire-1",
        paidAt: "not-a-date",
      }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors?.paidAt).toBeDefined();
  });
});
