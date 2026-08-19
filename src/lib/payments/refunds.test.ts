import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { Registration, RegistrationRefund } from "@/lib/types";
import { defaultRegistrationFinance } from "@/lib/registrations/finance";

vi.mock("server-only", () => ({}));

import {
  createRefundAndCancel,
  reconcileStripeRefund,
  toSmallestCurrencyUnit,
  verifyPaymentIntentForRegistration,
  type RefundServiceDeps,
} from "./refunds";

function registration(overrides: Partial<Registration> = {}): Registration {
  return {
    id: "reg-1",
    eventSlug: "mammoth-weekend",
    memberId: "member-1",
    answers: {},
    consentGiven: true,
    contactEmail: "rider@example.com",
    contactName: "Rider",
    contactPhone: "",
    status: "confirmed",
    attendanceStatus: "unmarked",
    attendanceSource: null,
    attendanceMarkedAt: null,
    finance: {
      ...defaultRegistrationFinance,
      depositAmount: 100,
      depositStatus: "paid",
      paymentMethod: "stripe",
      paymentCurrency: "usd",
      stripeCheckoutSessionId: "cs_test_1",
      stripePaymentIntentId: "pi_test_1",
    },
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function stripeRefund(overrides: Partial<Stripe.Refund> = {}): Stripe.Refund {
  return {
    id: "re_test_1",
    object: "refund",
    amount: 4000,
    balance_transaction: null,
    charge: "ch_test_1",
    created: 1,
    currency: "usd",
    destination_details: null,
    metadata: { registrationId: "reg-1", refundRequestId: "11111111-1111-4111-8111-111111111111" },
    payment_intent: "pi_test_1",
    reason: "requested_by_customer",
    receipt_number: null,
    source_transfer_reversal: null,
    status: "succeeded",
    transfer_reversal: null,
    ...overrides,
  } as Stripe.Refund;
}

function createHarness(refundResult = stripeRefund()) {
  const registrations = [registration()];
  const refunds: RegistrationRefund[] = [];
  const paymentIntent = {
    id: "pi_test_1",
    status: "succeeded",
    created: 1_700_000_000,
    latest_charge: {
      id: "ch_test_1",
      paid: true,
      amount_captured: 10000,
      amount_refunded: 0,
      currency: "usd",
    },
  } as unknown as Stripe.PaymentIntent;
  const stripe = {
    paymentIntents: { retrieve: vi.fn().mockResolvedValue(paymentIntent) },
    checkout: {
      sessions: {
        list: vi.fn().mockResolvedValue({
          data: [{
            id: "cs_test_1",
            payment_status: "paid",
            metadata: { eventSlug: "mammoth-weekend", memberId: "member-1" },
            customer_details: { email: "rider@example.com" },
          }],
        }),
      },
    },
    refunds: {
      create: vi.fn().mockResolvedValue(refundResult),
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
  } as unknown as Stripe;

  const deps: RefundServiceDeps = {
    stripe,
    getRegistration: async (id) => registrations.find((item) => item.id === id),
    getRegistrations: async () => registrations,
    updateRegistrationStatus: vi.fn(async (id, status) => {
      const item = registrations.find((row) => row.id === id);
      if (!item) return undefined;
      item.status = status;
      return item;
    }),
    updateRegistrationFinance: vi.fn(async (id, input) => {
      const item = registrations.find((row) => row.id === id);
      if (!item) return undefined;
      item.finance = { ...item.finance, ...input } as Registration["finance"];
      return item;
    }),
    getRegistrationRefunds: async (registrationId) =>
      registrationId ? refunds.filter((row) => row.registrationId === registrationId) : refunds,
    getRegistrationRefund: async (id) => refunds.find((row) => row.id === id),
    getRegistrationRefundByStripeId: async (id) => refunds.find((row) => row.stripeRefundId === id),
    createRegistrationRefund: vi.fn(async (input) => {
      const row: RegistrationRefund = {
        ...input,
        stripeRefundId: "",
        failureReason: "",
        createdAt: "2026-08-18T00:00:00.000Z",
        updatedAt: "2026-08-18T00:00:00.000Z",
      };
      refunds.push(row);
      return row;
    }),
    updateRegistrationRefund: vi.fn(async (id, input) => {
      const row = refunds.find((item) => item.id === id);
      if (!row) return undefined;
      Object.assign(row, input);
      return row;
    }),
  };
  return { deps, refunds, registrations, stripe };
}

describe("refund payment service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("handles zero-decimal and two-decimal currencies", () => {
    expect(toSmallestCurrencyUnit(12.34, "usd")).toBe(1234);
    expect(toSmallestCurrencyUnit(1234, "jpy")).toBe(1234);
  });

  it("verifies a historical PaymentIntent against event, member, email, amount, and currency", async () => {
    const { deps } = createHarness();
    const result = await verifyPaymentIntentForRegistration(deps, registration(), "pi_test_1");

    expect(result).toEqual(expect.objectContaining({
      success: true,
      preview: expect.objectContaining({ amount: 100, currency: "usd", refundableAmount: 100 }),
    }));
  });

  it("rejects a historical PaymentIntent for another member", async () => {
    const { deps, stripe } = createHarness();
    vi.mocked(stripe.checkout.sessions.list).mockResolvedValue({
      data: [{
        id: "cs_other",
        payment_status: "paid",
        metadata: { eventSlug: "mammoth-weekend", memberId: "member-other" },
        customer_details: { email: "rider@example.com" },
      }],
      object: "list",
      has_more: false,
      url: "/v1/checkout/sessions",
    } as Stripe.ApiList<Stripe.Checkout.Session>);

    await expect(verifyPaymentIntentForRegistration(deps, registration(), "pi_test_1")).resolves.toEqual({
      success: false,
      error: "The Stripe payment belongs to a different member.",
    });
  });

  it("creates a partial refund and always cancels the registration", async () => {
    const { deps, registrations, stripe } = createHarness();
    const result = await createRefundAndCancel(deps, {
      operationId: "11111111-1111-4111-8111-111111111111",
      registrationId: "reg-1",
      amount: 40,
      reason: "requested_by_customer",
      internalNote: "Customer cannot attend.",
      initiatedBy: "admin-1",
    });

    expect(result.success).toBe(true);
    expect(registrations[0].status).toBe("cancelled");
    expect(registrations[0].finance?.refundedAmount).toBe(40);
    expect(registrations[0].finance?.depositStatus).toBe("paid");
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 4000, payment_intent: "pi_test_1" }),
      { idempotencyKey: "snowforce-refund-11111111-1111-4111-8111-111111111111" },
    );
  });

  it("marks a fully refunded deposit as refunded and cancels registration", async () => {
    const { deps, registrations } = createHarness(stripeRefund({ amount: 10000 }));
    await createRefundAndCancel(deps, {
      operationId: "22222222-2222-4222-8222-222222222222",
      registrationId: "reg-1",
      amount: 100,
      reason: "duplicate",
      internalNote: "Duplicate payment.",
      initiatedBy: "admin-1",
    });

    expect(registrations[0].status).toBe("cancelled");
    expect(registrations[0].finance?.depositStatus).toBe("refunded");
  });

  it("does not cancel when Stripe rejects refund creation", async () => {
    const { deps, registrations, stripe, refunds } = createHarness();
    vi.mocked(stripe.refunds.create).mockRejectedValue(new Error("Refund amount is invalid"));
    const result = await createRefundAndCancel(deps, {
      operationId: "33333333-3333-4333-8333-333333333333",
      registrationId: "reg-1",
      amount: 20,
      reason: "requested_by_customer",
      internalNote: "Requested.",
      initiatedBy: "admin-1",
    });

    expect(result).toEqual({ success: false, error: "Refund amount is invalid" });
    expect(registrations[0].status).toBe("confirmed");
    expect(refunds[0].status).toBe("failed");
  });

  it("still cancels when Stripe succeeds but the audit update needs webhook reconciliation", async () => {
    const { deps, registrations } = createHarness();
    vi.mocked(deps.updateRegistrationRefund).mockRejectedValueOnce(new Error("database unavailable"));

    const result = await createRefundAndCancel(deps, {
      operationId: "44444444-4444-4444-8444-444444444444",
      registrationId: "reg-1",
      amount: 40,
      reason: "requested_by_customer",
      internalNote: "Customer request.",
      initiatedBy: "admin-1",
    });

    expect(result).toEqual(expect.objectContaining({
      success: true,
      warning: expect.stringMatching(/webhook reconciliation/i),
    }));
    expect(registrations[0].status).toBe("cancelled");
  });

  it("reconciles a webhook refund and cancels the registration", async () => {
    const { deps, registrations } = createHarness();
    await reconcileStripeRefund(deps, stripeRefund());

    expect(registrations[0].status).toBe("cancelled");
    expect(registrations[0].finance?.refundedAmount).toBe(40);
  });
});
