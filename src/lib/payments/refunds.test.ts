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
    metadata: {
      registrationId: "reg-1",
      refundRequestId: "11111111-1111-4111-8111-111111111111",
    },
    payment_intent: "pi_test_1",
    reason: "requested_by_customer",
    receipt_number: null,
    source_transfer_reversal: null,
    status: "succeeded",
    transfer_reversal: null,
    ...overrides,
  } as Stripe.Refund;
}

function checkoutSession(
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id: "cs_test_1",
    object: "checkout.session",
    adaptive_pricing: null,
    after_expiration: null,
    allow_promotion_codes: null,
    amount_subtotal: 10000,
    amount_total: 10000,
    automatic_tax: {
      enabled: false,
      liability: null,
      provider: null,
      status: null,
    },
    billing_address_collection: null,
    cancel_url: null,
    client_reference_id: null,
    client_secret: null,
    collected_information: null,
    consent: null,
    consent_collection: null,
    created: 1_700_000_000,
    currency: "usd",
    currency_conversion: null,
    custom_fields: [],
    custom_text: {
      after_submit: null,
      shipping_address: null,
      submit: null,
      terms_of_service_acceptance: null,
    },
    customer: null,
    customer_account: null,
    customer_creation: null,
    customer_details: {
      address: null,
      business_name: null,
      email: "rider@example.com",
      individual_name: null,
      name: "Rider",
      phone: null,
      tax_exempt: null,
      tax_ids: null,
    },
    customer_email: "rider@example.com",
    discounts: null,
    expires_at: 1_700_086_400,
    integration_identifier: null,
    invoice: null,
    invoice_creation: null,
    livemode: false,
    locale: null,
    managed_payments: null,
    metadata: { eventSlug: "mammoth-weekend", memberId: "member-1" },
    mode: "payment",
    origin_context: null,
    payment_intent: "pi_test_1",
    payment_link: null,
    payment_method_collection: null,
    payment_method_configuration_details: null,
    payment_method_options: null,
    payment_method_types: ["card"],
    payment_status: "paid",
    permissions: null,
    recovered_from: null,
    saved_payment_method_options: null,
    setup_intent: null,
    shipping_address_collection: null,
    shipping_cost: null,
    shipping_options: [],
    status: "complete",
    submit_type: null,
    subscription: null,
    success_url: null,
    total_details: null,
    ui_mode: "hosted_page",
    url: null,
    wallet_options: null,
    ...overrides,
  };
}

function checkoutSessionsResponse(
  data: Stripe.Checkout.Session[],
): Stripe.Response<Stripe.ApiList<Stripe.Checkout.Session>> {
  return {
    object: "list",
    has_more: false,
    url: "/v1/checkout/sessions",
    data,
    lastResponse: {
      headers: {},
      requestId: "req_test_fixture",
      statusCode: 200,
    },
  };
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
  } as unknown as Stripe.Response<Stripe.PaymentIntent>;
  const stripe = {
    paymentIntents: { retrieve: vi.fn().mockResolvedValue(paymentIntent) },
    checkout: {
      sessions: {
        list: vi
          .fn<Stripe["checkout"]["sessions"]["list"]>()
          .mockResolvedValue(checkoutSessionsResponse([checkoutSession()])),
      },
    },
    refunds: {
      create: vi.fn().mockResolvedValue(refundResult),
      list: vi.fn().mockResolvedValue({ data: [], has_more: false }),
      retrieve: vi.fn(),
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
      registrationId
        ? refunds.filter((row) => row.registrationId === registrationId)
        : refunds,
    getRegistrationRefund: async (id) => refunds.find((row) => row.id === id),
    getRegistrationRefundByStripeId: async (id) =>
      refunds.find((row) => row.stripeRefundId === id),
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

  it("cannot link a different friend’s payment just because their contact email and booker match", async () => {
    const { deps, stripe } = createHarness();
    const proxy = registration({
      memberId: null,
      bookerMemberId: "member-1",
      registrationKind: "proxy",
      pendingRegistrationId: "friend-1",
    });
    vi.mocked(stripe.checkout.sessions.list).mockResolvedValue(
      checkoutSessionsResponse([
        checkoutSession({
          metadata: {
            eventSlug: proxy.eventSlug,
            memberId: "member-1",
            pendingRegistrationId: "friend-2",
          },
        }),
      ]),
    );
    expect(
      await verifyPaymentIntentForRegistration(deps, proxy, "pi_test_1"),
    ).toEqual({
      success: false,
      error: "The Stripe payment belongs to a different attendee.",
    });
    vi.mocked(stripe.checkout.sessions.list).mockResolvedValue(
      checkoutSessionsResponse([
        checkoutSession({
          metadata: {
            eventSlug: proxy.eventSlug,
            memberId: "member-1",
            pendingRegistrationId: "friend-1",
          },
        }),
      ]),
    );
    expect(
      await verifyPaymentIntentForRegistration(deps, proxy, "pi_test_1"),
    ).toMatchObject({ success: true });
  });

  it("handles zero-decimal and two-decimal currencies", () => {
    expect(toSmallestCurrencyUnit(12.34, "usd")).toBe(1234);
    expect(toSmallestCurrencyUnit(1234, "jpy")).toBe(1234);
  });

  it("verifies a historical PaymentIntent against event, member, email, amount, and currency", async () => {
    const { deps } = createHarness();
    const result = await verifyPaymentIntentForRegistration(
      deps,
      registration(),
      "pi_test_1",
    );

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        preview: expect.objectContaining({
          amount: 100,
          currency: "usd",
          refundableAmount: 100,
        }),
      }),
    );
  });

  it("rejects a historical PaymentIntent for another member", async () => {
    const { deps, stripe } = createHarness();
    vi.mocked(stripe.checkout.sessions.list).mockResolvedValue(
      checkoutSessionsResponse([
        checkoutSession({
          id: "cs_other",
          metadata: { eventSlug: "mammoth-weekend", memberId: "member-other" },
        }),
      ]),
    );

    await expect(
      verifyPaymentIntentForRegistration(deps, registration(), "pi_test_1"),
    ).resolves.toEqual({
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
      {
        idempotencyKey: "snowforce-refund-11111111-1111-4111-8111-111111111111",
      },
    );
  });

  it("marks a fully refunded deposit as refunded and cancels registration", async () => {
    const { deps, registrations } = createHarness(
      stripeRefund({ amount: 10000 }),
    );
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
    vi.mocked(stripe.refunds.create).mockRejectedValue(
      new Error("Refund amount is invalid"),
    );
    const result = await createRefundAndCancel(deps, {
      operationId: "33333333-3333-4333-8333-333333333333",
      registrationId: "reg-1",
      amount: 20,
      reason: "requested_by_customer",
      internalNote: "Requested.",
      initiatedBy: "admin-1",
    });

    expect(result).toEqual({
      success: false,
      error: "Refund amount is invalid",
    });
    expect(registrations[0].status).toBe("confirmed");
    expect(refunds[0].status).toBe("failed");
  });

  it("still cancels when Stripe succeeds but the audit update needs webhook reconciliation", async () => {
    const { deps, registrations } = createHarness();
    vi.mocked(deps.updateRegistrationRefund).mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    const result = await createRefundAndCancel(deps, {
      operationId: "44444444-4444-4444-8444-444444444444",
      registrationId: "reg-1",
      amount: 40,
      reason: "requested_by_customer",
      internalNote: "Customer request.",
      initiatedBy: "admin-1",
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        warning: expect.stringMatching(/webhook reconciliation/i),
      }),
    );
    expect(registrations[0].status).toBe("cancelled");
  });

  it("imports an external webhook refund without approving cancellation or settling the trip", async () => {
    const { deps, registrations } = createHarness();
    await reconcileStripeRefund(deps, stripeRefund());

    expect(registrations[0].status).toBe("confirmed");
    expect(registrations[0].finance?.settlementStatus).toBe("not_started");
    expect(registrations[0].finance?.refundedAmount).toBe(40);
  });
  it("rejects a refund operation reused against another payment", async () => {
    const { deps, stripe } = createHarness();
    deps.getRegistrationRefund = async () =>
      ({
        id: "11111111-1111-4111-8111-111111111111",
        registrationId: "different-ticket",
        amount: 40,
        stripePaymentIntentId: "pi_other",
      }) as RegistrationRefund;
    const result = await createRefundAndCancel(deps, {
      operationId: "11111111-1111-4111-8111-111111111111",
      registrationId: "reg-1",
      amount: 40,
      reason: "requested_by_customer",
      internalNote: "Approved",
      initiatedBy: "admin-1",
    });
    expect(result.success).toBe(false);
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });
});

describe("refund timeout recovery", () => {
  const input = {
    operationId: "99999999-9999-4999-8999-999999999999",
    registrationId: "reg-1",
    amount: 100,
    reason: "requested_by_customer" as const,
    internalNote: "Approved refund",
    initiatedBy: "admin-1",
  };
  async function unknownOutcome() {
    const h = createHarness();
    vi.mocked(h.stripe.refunds.create).mockRejectedValueOnce(
      Object.assign(new Error("timeout"), { type: "StripeConnectionError" }),
    );
    expect((await createRefundAndCancel(h.deps, input)).success).toBe(false);
    h.refunds[0].createdAt = new Date().toISOString();
    return h;
  }
  function providerRefund(
    patch: Partial<Stripe.Refund> = {},
  ): Stripe.Response<Stripe.Refund> {
    return {
      ...stripeRefund({
        amount: 10000,
        metadata: {
          registrationId: "reg-1",
          refundRequestId: input.operationId,
        },
        ...patch,
      }),
      lastResponse: { headers: {}, requestId: "req_fixture", statusCode: 200 },
    };
  }
  it("recovers a completed refund before rejecting a now-zero refundable balance", async () => {
    const h = await unknownOutcome();
    vi.mocked(h.stripe.paymentIntents.retrieve).mockResolvedValueOnce({
      id: "pi_test_1",
      status: "succeeded",
      latest_charge: {
        id: "ch_test_1",
        paid: true,
        amount_captured: 10000,
        amount_refunded: 10000,
        currency: "usd",
      },
    } as unknown as Stripe.Response<Stripe.PaymentIntent>);
    vi.mocked(h.stripe.refunds.list).mockResolvedValueOnce({
      data: [providerRefund()],
      has_more: false,
    } as unknown as Awaited<ReturnType<Stripe["refunds"]["list"]>>);
    const result = await createRefundAndCancel(h.deps, input);
    expect(result.success).toBe(true);
    expect(h.refunds[0].status).toBe("succeeded");
    expect(h.registrations[0].finance?.refundedAmount).toBe(100);
    expect(h.stripe.refunds.create).toHaveBeenCalledTimes(1);
  });
  it("checks a saved Stripe refund ID and repairs stale financial totals", async () => {
    const h = await unknownOutcome();
    h.refunds[0].stripeRefundId = "re_test_1";
    vi.mocked(h.stripe.refunds.retrieve).mockResolvedValueOnce(
      providerRefund(),
    );
    expect((await createRefundAndCancel(h.deps, input)).success).toBe(true);
    expect(h.stripe.refunds.retrieve).toHaveBeenCalledWith("re_test_1");
    expect(h.registrations[0].finance?.depositStatus).toBe("refunded");
    expect(h.stripe.refunds.create).toHaveBeenCalledTimes(1);
  });
  it("retries only a recent unmatched operation with the saved idempotency key and actor", async () => {
    const h = await unknownOutcome();
    vi.mocked(h.stripe.refunds.create).mockResolvedValueOnce(providerRefund());
    expect(
      (
        await createRefundAndCancel(h.deps, {
          ...input,
          initiatedBy: "admin-2",
          reason: "duplicate",
        })
      ).success,
    ).toBe(true);
    expect(h.stripe.refunds.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        reason: "requested_by_customer",
        metadata: expect.objectContaining({ initiatedBy: "admin-1" }),
      }),
      { idempotencyKey: `snowforce-refund-${input.operationId}` },
    );
  });
  it("never re-submits an unmatched operation after the idempotency safety window", async () => {
    const h = await unknownOutcome();
    h.refunds[0].createdAt = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(await createRefundAndCancel(h.deps, input)).toMatchObject({
      success: false,
      requiresReview: true,
    });
    expect(h.stripe.refunds.create).toHaveBeenCalledTimes(1);
  });
  it("recovers old operations when a matching provider result exists without creating money movements", async () => {
    const h = await unknownOutcome();
    h.refunds[0].createdAt = "2020-01-01T00:00:00Z";
    vi.mocked(h.stripe.refunds.list).mockResolvedValueOnce({
      data: [providerRefund()],
      has_more: false,
    } as unknown as Awaited<ReturnType<Stripe["refunds"]["list"]>>);
    expect((await createRefundAndCancel(h.deps, input)).success).toBe(true);
    expect(h.stripe.refunds.create).toHaveBeenCalledTimes(1);
  });
  it("does not create another refund when provider lookup fails or a recovered amount mismatches", async () => {
    const h = await unknownOutcome();
    vi.mocked(h.stripe.refunds.list).mockRejectedValueOnce(
      new Error("offline"),
    );
    expect(await createRefundAndCancel(h.deps, input)).toMatchObject({
      success: false,
      requiresReview: true,
    });
    vi.mocked(h.stripe.refunds.list).mockResolvedValueOnce({
      data: [providerRefund({ amount: 9000 })],
      has_more: false,
    } as unknown as Awaited<ReturnType<Stripe["refunds"]["list"]>>);
    expect(await createRefundAndCancel(h.deps, input)).toMatchObject({
      success: false,
      requiresReview: true,
    });
    expect(h.stripe.refunds.create).toHaveBeenCalledTimes(1);
  });
  it("pages through refund history to recover the same operation", async () => {
    const h = await unknownOutcome();
    vi.mocked(h.stripe.refunds.list)
      .mockResolvedValueOnce({
        data: [providerRefund({ id: "re_other", metadata: {} })],
        has_more: true,
      } as unknown as Awaited<ReturnType<Stripe["refunds"]["list"]>>)
      .mockResolvedValueOnce({
        data: [providerRefund()],
        has_more: false,
      } as unknown as Awaited<ReturnType<Stripe["refunds"]["list"]>>);
    expect((await createRefundAndCancel(h.deps, input)).success).toBe(true);
    expect(h.stripe.refunds.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ starting_after: "re_other" }),
    );
    expect(h.stripe.refunds.create).toHaveBeenCalledTimes(1);
  });
  it("records a failed recovered refund and requires review without issuing a replacement", async () => {
    const h = await unknownOutcome();
    vi.mocked(h.stripe.refunds.list).mockResolvedValueOnce({
      data: [providerRefund({ status: "failed" })],
      has_more: false,
    } as unknown as Awaited<ReturnType<Stripe["refunds"]["list"]>>);
    expect(await createRefundAndCancel(h.deps, input)).toMatchObject({
      success: false,
      requiresReview: true,
    });
    expect(h.refunds[0].status).toBe("failed");
    expect(h.stripe.refunds.create).toHaveBeenCalledTimes(1);
  });
});
