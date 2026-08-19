import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { Event, Registration, RegistrationFinance } from "@/lib/types";
import type { PendingRegistration } from "@/lib/registrations/pending-repository";

vi.mock("server-only", () => ({}));

const mockVerifyStripeWebhookSignature = vi.hoisted(() => vi.fn());
vi.mock("@/lib/payments/stripe-server", () => ({
  verifyStripeWebhookSignature: mockVerifyStripeWebhookSignature,
}));

const mockReconcileStripeRefund = vi.hoisted(() => vi.fn());
vi.mock("@/lib/payments/refunds", () => ({
  reconcileStripeRefund: mockReconcileStripeRefund,
}));
vi.mock("@/lib/payments/refund-repository", () => ({
  createRegistrationRefund: vi.fn(),
  getRegistrationRefund: vi.fn(),
  getRegistrationRefundByStripeId: vi.fn(),
  getRegistrationRefunds: vi.fn(),
  updateRegistrationRefund: vi.fn(),
}));

const mockGetPendingRegistrationById = vi.hoisted(() => vi.fn());
const mockDeletePendingRegistration = vi.hoisted(() => vi.fn());
vi.mock("@/lib/registrations/pending-repository", () => ({
  getPendingRegistrationById: mockGetPendingRegistrationById,
  deletePendingRegistration: mockDeletePendingRegistration,
}));

const mockCreateRegistration = vi.hoisted(() => vi.fn());
const mockGetRegistrations = vi.hoisted(() => vi.fn());
const mockGetRegistrationCountForEvent = vi.hoisted(() => vi.fn());
const mockGetRegistration = vi.hoisted(() => vi.fn());
const mockUpdateRegistrationFinance = vi.hoisted(() => vi.fn());
const mockUpdateRegistrationStatus = vi.hoisted(() => vi.fn());
vi.mock("@/lib/registrations/repository", () => ({
  createRegistration: mockCreateRegistration,
  getRegistration: mockGetRegistration,
  getRegistrations: mockGetRegistrations,
  getRegistrationCountForEvent: mockGetRegistrationCountForEvent,
  updateRegistrationFinance: mockUpdateRegistrationFinance,
  updateRegistrationStatus: mockUpdateRegistrationStatus,
}));

const mockCreateWaiverAcceptance = vi.hoisted(() => vi.fn());
vi.mock("@/lib/registrations/waiver-repository", () => ({
  createWaiverAcceptance: mockCreateWaiverAcceptance,
}));

const mockGetEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/events/repository", () => ({
  getEvent: mockGetEvent,
}));

const mockHasRemainingCapacity = vi.hoisted(() => vi.fn());
vi.mock("@/lib/events/availability", () => ({
  hasRemainingCapacity: mockHasRemainingCapacity,
}));

const mockRevalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

const insertBehavior = vi.hoisted(() => vi.fn());
const insertMaybeSingle = vi.hoisted(() => vi.fn());
const insertSelect = vi.hoisted(() => vi.fn());
const insertBuilder = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: insertBehavior.mockImplementation(() => ({
        select: insertSelect.mockImplementation(() => ({
          maybeSingle: insertMaybeSingle,
        })),
      })),
    })),
  })),
}));

import { POST } from "./route";

const ENV_BACKUP = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function buildPendingRegistration(overrides: Partial<PendingRegistration> = {}): PendingRegistration {
  return {
    id: "pending-1",
    eventSlug: "mammoth-weekend",
    memberId: "member-1",
    answers: { name: "Rider", email: "rider@example.com" },
    consentGiven: true,
    contactEmail: "rider@example.com",
    contactName: "Rider",
    contactPhone: "555-0100",
    tokenHash: "hash-1",
    expiresAt: "2099-01-01T00:00:00.000Z",
    createdAt: "2026-06-30T00:00:00.000Z",
    ...overrides,
  };
}

function buildEvent(overrides: Partial<Event> = {}): Event {
  return {
    slug: "mammoth-weekend",
    status: "published",
    registrationState: "open",
    title: { en: "Mammoth Weekend", zh: "猛犸周末" },
    eventDate: "2099-02-01T00:00:00.000Z",
    meetTime: "07:00",
    meetLocation: { en: "Lot A", zh: "A 停车场" },
    activityLocation: { en: "Mammoth", zh: "猛犸" },
    locationUrl: "https://example.com/map",
    coverImage: "/cover.jpg",
    capacity: 10,
    registrationCount: 0,
    registrationCloseAt: "2099-01-31T00:00:00.000Z",
    requiresApproval: false,
    allowWaitlist: false,
    allowCancellation: true,
    feeAmount: "100",
    paymentModel: "deposit",
    depositAmount: 100,
    depositCurrency: "usd",
    fullPaymentAmount: null,
    paymentInstructions: { en: "Pay later", zh: "稍后付款" },
    seoTitle: { en: "Mammoth Weekend", zh: "猛犸周末" },
    seoDescription: { en: "Ride", zh: "滑雪" },
    registrationQuestions: [],
    detailModules: [],
    ...overrides,
  };
}

function buildRegistration(overrides: Partial<Registration> = {}): Registration {
  return {
    id: "reg-1",
    eventSlug: "mammoth-weekend",
    memberId: "member-1",
    answers: { name: "Rider", email: "rider@example.com" },
    consentGiven: true,
    contactEmail: "rider@example.com",
    contactName: "Rider",
    contactPhone: "555-0100",
    status: "confirmed",
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    ...overrides,
  };
}

function buildRequest(body: string, signature = "t=123,v1=valid") {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    body,
    headers: { "stripe-signature": signature },
  });
}

function buildEventJson(
  eventId: string,
  type: string,
  dataObject: Record<string, unknown>,
): string {
  return JSON.stringify({
    id: eventId,
    type,
    data: { object: dataObject },
  });
}

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = ENV_BACKUP.NEXT_PUBLIC_SUPABASE_URL;
  process.env.SUPABASE_SECRET_KEY = ENV_BACKUP.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ENV_BACKUP.SUPABASE_SERVICE_ROLE_KEY;
});

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = undefined;
  vi.clearAllMocks();
  insertMaybeSingle.mockResolvedValue({ data: { event_id: "evt_1" }, error: null });
  mockGetPendingRegistrationById.mockResolvedValue(undefined);
  mockDeletePendingRegistration.mockResolvedValue(undefined);
  mockGetEvent.mockResolvedValue(undefined);
  mockGetRegistrations.mockResolvedValue([]);
  mockGetRegistrationCountForEvent.mockResolvedValue(0);
  mockHasRemainingCapacity.mockReturnValue(true);
  mockCreateRegistration.mockResolvedValue({ success: true, registration: buildRegistration() });
  mockReconcileStripeRefund.mockResolvedValue(undefined);
});

describe("Stripe webhook route", () => {
  it("(a) returns 400 when signature verification throws", async () => {
    const body = buildEventJson("evt_1", "checkout.session.completed", { amount_total: 10000 });
    mockVerifyStripeWebhookSignature.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const response = await POST(buildRequest(body));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Invalid signature");
    expect(insertMaybeSingle).not.toHaveBeenCalled();
    expect(mockCreateRegistration).not.toHaveBeenCalled();
  });

  it("(b) retries incomplete completed-checkout work when event_id is already recorded (23505)", async () => {
    const body = buildEventJson("evt_2", "checkout.session.completed", {
      amount_total: 10000,
      metadata: { pendingRegistrationId: "pending-1" },
    });
    mockVerifyStripeWebhookSignature.mockReturnValue({
      id: "evt_2",
      type: "checkout.session.completed",
      data: { object: { amount_total: 10000, metadata: { pendingRegistrationId: "pending-1" } } },
    } as unknown as Stripe.Event);
    insertMaybeSingle.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });

    const response = await POST(buildRequest(body));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
    expect(mockCreateRegistration).not.toHaveBeenCalled();
    expect(mockGetPendingRegistrationById).toHaveBeenCalledWith("pending-1");
  });

  it("(c) creates a paid deposit registration, deletes pending, and returns 200", async () => {
    const body = buildEventJson("evt_3", "checkout.session.completed", {
      id: "cs_test_1",
      amount_total: 10000,
      currency: "usd",
      payment_intent: "pi_test_1",
      metadata: { pendingRegistrationId: "pending-1" },
    });
    mockVerifyStripeWebhookSignature.mockReturnValue({
      id: "evt_3",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_1",
          amount_total: 10000,
          currency: "usd",
          payment_intent: "pi_test_1",
          metadata: { pendingRegistrationId: "pending-1" },
        },
      },
    } as unknown as Stripe.Event);
    mockGetPendingRegistrationById.mockResolvedValue(buildPendingRegistration());
    mockGetEvent.mockResolvedValue(
      buildEvent({ paymentModel: "deposit", depositAmount: 100, depositCurrency: "usd" }),
    );
    mockGetRegistrationCountForEvent.mockResolvedValue(1);
    mockHasRemainingCapacity.mockReturnValue(true);
    mockGetRegistrations.mockResolvedValue([]);

    const response = await POST(buildRequest(body));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
    expect(mockCreateRegistration).toHaveBeenCalledTimes(1);
    const callArg = mockCreateRegistration.mock.calls[0]?.[0] as {
      finance: RegistrationFinance;
      eventSlug: string;
      memberId: string | null;
    };
    expect(callArg.eventSlug).toBe("mammoth-weekend");
    expect(callArg.memberId).toBe("member-1");
    expect(callArg.finance.depositStatus).toBe("paid");
    expect(callArg.finance.paymentMethod).toBe("stripe");
    expect(callArg.finance.paymentCurrency).toBe("usd");
    expect(callArg.finance.stripeCheckoutSessionId).toBe("cs_test_1");
    expect(callArg.finance.stripePaymentIntentId).toBe("pi_test_1");
    expect(callArg.finance.depositAmount).toBe(100);
    expect(callArg.finance.finalAmount).toBeNull();
    expect(callArg.finance.settlementStatus).toBe("not_started");
    expect(mockCreateWaiverAcceptance).not.toHaveBeenCalled();
    expect(mockDeletePendingRegistration).toHaveBeenCalledWith("pending-1");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/member");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/events/mammoth-weekend");
  });

  it("(c2) stores the pending waiver snapshot with the paid registration", async () => {
    const body = buildEventJson("evt_waiver", "checkout.session.completed", {
      amount_total: 10000,
      metadata: { pendingRegistrationId: "pending-1" },
    });
    mockVerifyStripeWebhookSignature.mockReturnValue({
      id: "evt_waiver",
      type: "checkout.session.completed",
      data: { object: { amount_total: 10000, metadata: { pendingRegistrationId: "pending-1" } } },
    } as unknown as Stripe.Event);
    mockGetPendingRegistrationById.mockResolvedValue(buildPendingRegistration({
      waiverTextEn: "Release terms",
      waiverTextSha: "a".repeat(64),
      typedName: "Rider",
      handwrittenSignatureDataUrl: "data:image/png;base64,c2lnbmF0dXJl",
    }));
    mockGetEvent.mockResolvedValue(buildEvent());

    const response = await POST(buildRequest(body));

    expect(response.status).toBe(200);
    expect(mockCreateWaiverAcceptance).toHaveBeenCalledWith(expect.objectContaining({
      registrationId: "reg-1",
      legalTextSnapshot: "Release terms",
      typedName: "Rider",
      handwrittenSignatureDataUrl: "data:image/png;base64,c2lnbmF0dXJl",
    }));
    expect(mockDeletePendingRegistration).toHaveBeenCalledWith("pending-1");
  });

  it("(d) stamps finalAmount=paidAmount and settlementStatus=settled for full_prepay events", async () => {
    const body = buildEventJson("evt_4", "checkout.session.completed", {
      amount_total: 50000,
      metadata: { pendingRegistrationId: "pending-1" },
    });
    mockVerifyStripeWebhookSignature.mockReturnValue({
      id: "evt_4",
      type: "checkout.session.completed",
      data: {
        object: {
          amount_total: 50000,
          metadata: { pendingRegistrationId: "pending-1" },
        },
      },
    } as unknown as Stripe.Event);
    mockGetPendingRegistrationById.mockResolvedValue(buildPendingRegistration());
    mockGetEvent.mockResolvedValue(
      buildEvent({ paymentModel: "full_prepay", fullPaymentAmount: 500, depositCurrency: "usd" }),
    );

    const response = await POST(buildRequest(body));

    expect(response.status).toBe(200);
    const callArg = mockCreateRegistration.mock.calls[0]?.[0] as { finance: RegistrationFinance };
    expect(callArg.finance.depositAmount).toBe(500);
    expect(callArg.finance.finalAmount).toBe(500);
    expect(callArg.finance.settlementAmount).toBe(0);
    expect(callArg.finance.settlementStatus).toBe("settled");
  });

  it("(e) keeps finalAmount=null and settlementStatus=not_started for deposit events", async () => {
    const body = buildEventJson("evt_5", "checkout.session.completed", {
      amount_total: 10000,
      metadata: { pendingRegistrationId: "pending-1" },
    });
    mockVerifyStripeWebhookSignature.mockReturnValue({
      id: "evt_5",
      type: "checkout.session.completed",
      data: {
        object: {
          amount_total: 10000,
          metadata: { pendingRegistrationId: "pending-1" },
        },
      },
    } as unknown as Stripe.Event);
    mockGetPendingRegistrationById.mockResolvedValue(buildPendingRegistration());
    mockGetEvent.mockResolvedValue(
      buildEvent({ paymentModel: "deposit", depositAmount: 100, depositCurrency: "usd" }),
    );

    const response = await POST(buildRequest(body));

    expect(response.status).toBe(200);
    const callArg = mockCreateRegistration.mock.calls[0]?.[0] as { finance: RegistrationFinance };
    expect(callArg.finance.depositAmount).toBe(100);
    expect(callArg.finance.finalAmount).toBeNull();
    expect(callArg.finance.settlementStatus).toBe("not_started");
  });

  it("(f) returns 200 without creating a registration when pending registration is not found", async () => {
    const body = buildEventJson("evt_6", "checkout.session.completed", {
      amount_total: 10000,
      metadata: { pendingRegistrationId: "missing-pending" },
    });
    mockVerifyStripeWebhookSignature.mockReturnValue({
      id: "evt_6",
      type: "checkout.session.completed",
      data: {
        object: {
          amount_total: 10000,
          metadata: { pendingRegistrationId: "missing-pending" },
        },
      },
    } as unknown as Stripe.Event);
    mockGetPendingRegistrationById.mockResolvedValue(undefined);

    const response = await POST(buildRequest(body));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
    expect(mockCreateRegistration).not.toHaveBeenCalled();
  });

  it("(g) records idempotency row and returns 200 without registration work for non-checkout events", async () => {
    const body = buildEventJson("evt_7", "payment_intent.succeeded", { amount: 100 });
    mockVerifyStripeWebhookSignature.mockReturnValue({
      id: "evt_7",
      type: "payment_intent.succeeded",
      data: { object: { amount: 100 } },
    } as unknown as Stripe.Event);

    const response = await POST(buildRequest(body));

    expect(response.status).toBe(200);
    expect(insertMaybeSingle).toHaveBeenCalled();
    expect(mockGetPendingRegistrationById).not.toHaveBeenCalled();
    expect(mockCreateRegistration).not.toHaveBeenCalled();
  });

  it("(h) returns 200 (not 500) when createRegistration throws a registrations_one_member_per_event duplicate", async () => {
    const body = buildEventJson("evt_8", "checkout.session.completed", {
      id: "cs_test_race",
      amount_total: 10000,
      currency: "usd",
      payment_intent: "pi_test_race",
      metadata: { pendingRegistrationId: "pending-1" },
    });
    mockVerifyStripeWebhookSignature.mockReturnValue({
      id: "evt_8",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_race",
          amount_total: 10000,
          currency: "usd",
          payment_intent: "pi_test_race",
          metadata: { pendingRegistrationId: "pending-1" },
        },
      },
    } as unknown as Stripe.Event);
    mockGetPendingRegistrationById.mockResolvedValue(buildPendingRegistration());
    mockGetEvent.mockResolvedValue(
      buildEvent({ paymentModel: "deposit", depositAmount: 100, depositCurrency: "usd" }),
    );
    mockGetRegistrations.mockResolvedValueOnce([]).mockResolvedValueOnce([buildRegistration()]);
    mockCreateRegistration.mockImplementation(() => {
      throw new Error(
        'duplicate key value violates unique constraint "registrations_one_member_per_event"',
      );
    });

    const response = await POST(buildRequest(body));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
    expect(mockUpdateRegistrationFinance).toHaveBeenCalledWith("reg-1", {
      paymentCurrency: "usd",
      stripeCheckoutSessionId: "cs_test_race",
      stripePaymentIntentId: "pi_test_race",
    });
    expect(mockDeletePendingRegistration).toHaveBeenCalledWith("pending-1");
  });

  it("(i) treats JPY amounts as the integer unit (no /100) when stamping finance", async () => {
    const body = buildEventJson("evt_9", "checkout.session.completed", {
      amount_total: 12000,
      metadata: { pendingRegistrationId: "pending-1" },
    });
    mockVerifyStripeWebhookSignature.mockReturnValue({
      id: "evt_9",
      type: "checkout.session.completed",
      data: {
        object: {
          amount_total: 12000,
          metadata: { pendingRegistrationId: "pending-1" },
        },
      },
    } as unknown as Stripe.Event);
    mockGetPendingRegistrationById.mockResolvedValue(buildPendingRegistration());
    mockGetEvent.mockResolvedValue(
      buildEvent({ paymentModel: "deposit", depositAmount: 12000, depositCurrency: "jpy" }),
    );

    const response = await POST(buildRequest(body));

    expect(response.status).toBe(200);
    const callArg = mockCreateRegistration.mock.calls[0]?.[0] as { finance: RegistrationFinance };
    expect(callArg.finance.depositAmount).toBe(12000);
    expect(callArg.finance.depositStatus).toBe("paid");
  });

  it("(j) returns 500 when createRegistration throws a non-duplicate error", async () => {
    const body = buildEventJson("evt_10", "checkout.session.completed", {
      amount_total: 10000,
      metadata: { pendingRegistrationId: "pending-1" },
    });
    mockVerifyStripeWebhookSignature.mockReturnValue({
      id: "evt_10",
      type: "checkout.session.completed",
      data: {
        object: {
          amount_total: 10000,
          metadata: { pendingRegistrationId: "pending-1" },
        },
      },
    } as unknown as Stripe.Event);
    mockGetPendingRegistrationById.mockResolvedValue(buildPendingRegistration());
    mockGetEvent.mockResolvedValue(
      buildEvent({ paymentModel: "deposit", depositAmount: 100, depositCurrency: "usd" }),
    );
    mockCreateRegistration.mockImplementation(() => {
      throw new Error("database connection failed");
    });

    const response = await POST(buildRequest(body));

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Server error");
    expect(mockDeletePendingRegistration).not.toHaveBeenCalled();
  });

  it("(k) returns 500 when the idempotency insert returns a non-23505 error", async () => {
    const body = buildEventJson("evt_11", "checkout.session.completed", {
      amount_total: 10000,
      metadata: { pendingRegistrationId: "pending-1" },
    });
    mockVerifyStripeWebhookSignature.mockReturnValue({
      id: "evt_11",
      type: "checkout.session.completed",
      data: {
        object: {
          amount_total: 10000,
          metadata: { pendingRegistrationId: "pending-1" },
        },
      },
    } as unknown as Stripe.Event);
    insertMaybeSingle.mockResolvedValue({
      data: null,
      error: { code: "PGRST500", message: "internal database error" },
    });

    const response = await POST(buildRequest(body));

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Server error");
    expect(mockGetPendingRegistrationById).not.toHaveBeenCalled();
    expect(mockCreateRegistration).not.toHaveBeenCalled();
  });

  it("(l) reconciles refund events so a refund also cancels the registration", async () => {
    const refund = {
      id: "re_test_1",
      amount: 4000,
      currency: "usd",
      metadata: { registrationId: "reg-1" },
      payment_intent: "pi_test_1",
      status: "succeeded",
    };
    const body = buildEventJson("evt_refund", "refund.created", refund);
    mockVerifyStripeWebhookSignature.mockReturnValue({
      id: "evt_refund",
      type: "refund.created",
      data: { object: refund },
    } as unknown as Stripe.Event);

    const response = await POST(buildRequest(body));

    expect(response.status).toBe(200);
    expect(mockReconcileStripeRefund).toHaveBeenCalledWith(expect.any(Object), refund);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/registrations");
  });
});
