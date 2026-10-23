import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

vi.mock("server-only", () => ({}));

const verifySignature = vi.hoisted(() => vi.fn());
const fulfillCheckoutSession = vi.hoisted(() => vi.fn());
const reconcileStripeRefund = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
const insertMaybeSingle = vi.hoisted(() => vi.fn());
const reconcileExpiredCheckout = vi.hoisted(() => vi.fn());
vi.mock("@/lib/payments/checkout-reconciliation", () => ({ reconcileExpiredCheckout }));

vi.mock("@/lib/payments/stripe-server", () => ({ verifyStripeWebhookSignature: verifySignature }));
vi.mock("@/lib/payments/fulfillment", () => ({ fulfillCheckoutSession }));
vi.mock("@/lib/payments/refunds", () => ({ reconcileStripeRefund }));
vi.mock("@/lib/payments/refund-repository", () => ({
  createRegistrationRefund: vi.fn(), getRegistrationRefund: vi.fn(), getRegistrationRefundByStripeId: vi.fn(),
  getRegistrationRefunds: vi.fn(), updateRegistrationRefund: vi.fn(),
}));
vi.mock("@/lib/registrations/repository", () => ({
  getRegistration: vi.fn(), getRegistrations: vi.fn(), updateRegistrationFinance: vi.fn(), updateRegistrationStatus: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({ insert: () => ({ select: () => ({ maybeSingle: insertMaybeSingle }) }) })),
  })),
}));

import { POST } from "./route";

const envBackup = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  secret: process.env.SUPABASE_SECRET_KEY,
  serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function request() {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST", body: "{}", headers: { "stripe-signature": "t=123,v1=valid" },
  });
}

function checkoutEvent(id = "evt_1") {
  return {
    id, type: "checkout.session.completed",
    data: { object: {
      id: "cs_live_1", status: "complete", payment_status: "paid", amount_total: 9900, currency: "usd",
      payment_intent: "pi_live_1",
      metadata: { pendingRegistrationId: "pending-1", eventSlug: "mammoth", memberId: "member-1" },
    } },
  } as unknown as Stripe.Event;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";
  process.env.SUPABASE_SERVICE_ROLE_KEY = undefined;
  vi.clearAllMocks();
  insertMaybeSingle.mockResolvedValue({ data: { event_id: "evt_1" }, error: null });
  fulfillCheckoutSession.mockResolvedValue({ status: "confirmed", registrationId: "registration-1" });
  reconcileStripeRefund.mockResolvedValue(undefined);
});

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = envBackup.url;
  process.env.SUPABASE_SECRET_KEY = envBackup.secret;
  process.env.SUPABASE_SERVICE_ROLE_KEY = envBackup.serviceRole;
});

describe("Stripe webhook route", () => {
  it("rejects a request with an invalid signature", async () => {
    verifySignature.mockImplementation(() => { throw new Error("bad signature"); });

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Invalid signature");
  });

  it("fulfills a paid Checkout and refreshes the member and event views", async () => {
    verifySignature.mockReturnValue(checkoutEvent());

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(fulfillCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ id: "cs_live_1" }));
    expect(revalidatePath).toHaveBeenCalledWith("/member");
    expect(revalidatePath).toHaveBeenCalledWith("/member/trips");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/registrations");
    expect(revalidatePath).toHaveBeenCalledWith("/events/mammoth");
  });

  it("retries fulfillment even if Stripe redelivers an already-recorded event", async () => {
    verifySignature.mockReturnValue(checkoutEvent("evt_duplicate"));
    insertMaybeSingle.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate" } });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(fulfillCheckoutSession).toHaveBeenCalledOnce();
  });

  it("returns 500 so Stripe retries a Checkout that cannot be fulfilled", async () => {
    verifySignature.mockReturnValue(checkoutEvent());
    fulfillCheckoutSession.mockRejectedValue(new Error("paid_checkout_pending_missing"));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Checkout requires reconciliation");
  });

  it("records other Stripe event types without registration work", async () => {
    verifySignature.mockReturnValue({ id: "evt_other", type: "payment_intent.succeeded", data: { object: {} } } as unknown as Stripe.Event);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(fulfillCheckoutSession).not.toHaveBeenCalled();
  });

  it("reconciles a signed expiration before releasing any seat", async () => {
    verifySignature.mockReturnValue({ id: "evt_expired", type: "checkout.session.expired", data: { object: {
      id: "cs_test_expired", metadata: { pendingRegistrationId: "pending-1" },
    } } });
    reconcileExpiredCheckout.mockResolvedValue(true);
    expect((await POST(request())).status).toBe(200);
    expect(reconcileExpiredCheckout).toHaveBeenCalledWith("cs_test_expired", "pending-1");
    expect(fulfillCheckoutSession).not.toHaveBeenCalled();
    reconcileExpiredCheckout.mockRejectedValue(new Error("Stripe unavailable"));
    expect((await POST(request())).status).toBe(500);
  });

  it("reconciles refunds through the existing refund ledger", async () => {
    const refund = { id: "re_1", amount: 9900, currency: "usd", metadata: { registrationId: "registration-1" } };
    verifySignature.mockReturnValue({ id: "evt_refund", type: "refund.created", data: { object: refund } } as unknown as Stripe.Event);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(reconcileStripeRefund).toHaveBeenCalledWith(expect.any(Object), refund);
  });

  it("returns 500 when the event receipt itself cannot be recorded", async () => {
    verifySignature.mockReturnValue(checkoutEvent());
    insertMaybeSingle.mockResolvedValue({ data: null, error: { code: "PGRST500", message: "database down" } });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(fulfillCheckoutSession).not.toHaveBeenCalled();
  });
});
