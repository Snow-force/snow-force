import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ rpc }) }));
import type Stripe from "stripe";
import { reconcileExpiredCheckout, reconcileFailedAsyncCheckout, releaseExpiredCheckoutHold } from "./checkout-reconciliation";
import type { PendingRegistration } from "@/lib/registrations/pending-repository";

const pending: PendingRegistration = { id: "pending", memberId: "booker", eventSlug: "event", answers: {}, consentGiven: true,
  contactEmail: "payer@example.test", contactName: "Friend", contactPhone: "", tokenHash: "hash", expiresAt: "2020-01-01", createdAt: "2020-01-01",
  checkoutAttempt: { id: "attempt", sessionId: "session", createdAt: "2020-01-01", amount: 10, currency: "usd", paymentModel: "deposit", couponCode: "", discountAmount: 0, params: {} } };
function harness(status = "expired", overrides = {}) {
  const retrieve = vi.fn().mockResolvedValue({ id: "session", status, payment_status: "unpaid",
    metadata: { pendingRegistrationId: "pending", memberId: "booker", checkoutAttemptId: "attempt", eventSlug: "event" }, ...overrides });
  return { getStripe: () => ({ checkout: { sessions: { retrieve } } }) as unknown as Stripe,
    getPending: vi.fn().mockResolvedValue(pending), release: vi.fn().mockResolvedValue(true) };
}
beforeEach(() => vi.clearAllMocks());
describe("authoritative checkout expiry", () => {
  it.each(["requires_payment_method","canceled"])("releases a signed async failure only after re-reading a %s intent",async (status) => {
    const deps=harness("complete",{payment_intent:"pi_failed"});
    const stripe=deps.getStripe();
    stripe.paymentIntents={retrieve:vi.fn().mockResolvedValue({status,metadata:{pendingRegistrationId:"pending",memberId:"booker",checkoutAttemptId:"attempt",eventSlug:"event"}})} as unknown as Stripe["paymentIntents"];
    deps.getStripe=()=>stripe;
    expect(await reconcileFailedAsyncCheckout("session","pending",deps)).toBe(true);
    expect(deps.release).toHaveBeenCalledWith("pending","attempt","session");
  });
  it.each(["processing","succeeded","requires_action"])("never releases an async %s intent even when a delayed failure event arrives",async (status) => {
    const deps=harness("complete",{payment_intent:"pi"}); const stripe=deps.getStripe();
    stripe.paymentIntents={retrieve:vi.fn().mockResolvedValue({status,metadata:{}})} as unknown as Stripe["paymentIntents"];deps.getStripe=()=>stripe;
    expect(await reconcileFailedAsyncCheckout("session","pending",deps)).toBe(false);expect(deps.release).not.toHaveBeenCalled();
  });
  it("keeps failed intents with mismatched metadata and paid or incomplete sessions held",async () => {
    for (const override of [{},{payment_status:"paid"},{status:"open"},{metadata:{memberId:"other"}},{payment_intent:null}]) {
      const deps=harness("complete",{payment_intent:"pi",...override});const stripe=deps.getStripe();
      stripe.paymentIntents={retrieve:vi.fn().mockResolvedValue({status:"requires_payment_method",metadata:{pendingRegistrationId:"pending",memberId:"other"}})} as unknown as Stripe["paymentIntents"];deps.getStripe=()=>stripe;
      expect(await reconcileFailedAsyncCheckout("session","pending",deps)).toBe(false);expect(deps.release).not.toHaveBeenCalled();
    }
  });
  it.each(["open", "complete"])("does not release %s checkout inventory even after the hold timer expires", async (status) => {
    const deps = harness(status); expect(await reconcileExpiredCheckout("session", "pending", deps)).toBe(false); expect(deps.release).not.toHaveBeenCalled();
  });
  it("releases only the same expired Stripe session and immutable attempt", async () => {
    const deps = harness(); expect(await reconcileExpiredCheckout("session", "pending", deps)).toBe(true);
    expect(deps.release).toHaveBeenCalledWith("pending", "attempt", "session");
  });
  it("recovers the session reference if saving the Stripe response failed", async () => {
    const deps = harness(); deps.getPending.mockResolvedValue({ ...pending, checkoutAttempt: { ...pending.checkoutAttempt!, sessionId: undefined } });
    expect(await reconcileExpiredCheckout("session", "pending", deps)).toBe(true);
  });
  it("rejects paid sessions and forged owner metadata", async () => {
    for (const changes of [{ payment_status: "paid" }, { metadata: { pendingRegistrationId: "pending", memberId: "other" } }]) {
      const deps = harness("expired", changes); expect(await reconcileExpiredCheckout("session", "pending", deps)).toBe(false); expect(deps.release).not.toHaveBeenCalled();
    }
  });
  it("uses an atomic compare-and-release and surfaces DB errors", async () => {
    rpc.mockResolvedValue({ data: true, error: null }); expect(await releaseExpiredCheckoutHold("pending", "attempt", "session")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("release_registration_checkout_hold", { pending_id_input: "pending", attempt_id_input: "attempt", session_id_input: "session" });
    rpc.mockResolvedValue({ error: { message: "failure" } }); await expect(releaseExpiredCheckoutHold("pending", "attempt", "session")).rejects.toThrow("checkout_hold_release_failed");
  });
});
