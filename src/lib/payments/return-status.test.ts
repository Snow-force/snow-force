import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type Stripe from "stripe";
import type { ReturnStatusDeps } from "./return-status";
import { resolvePaymentReturnStatus } from "./return-status";
import type { Registration } from "@/lib/types";

function harness() {
  const row: Registration = { id: "friend", memberId: null, bookerMemberId: "booker", registrationKind: "proxy", eventSlug: "event", answers: {},
    consentGiven: true, contactEmail: "payer@example.test", contactName: "Friend", contactPhone: "", status: "confirmed",
    attendanceStatus: "unmarked", attendanceSource: null, attendanceMarkedAt: null, createdAt: "2026-10-22", updatedAt: "2026-10-22",
    finance: { depositAmount: 1,depositStatus: "paid",depositPaidAt: "",paymentMethod: "stripe",paymentCurrency: "usd",paymentNote: "",
      stripeCheckoutSessionId: "cs_test_123",stripePaymentIntentId: "pi_test_123",refundedAmount: 0,lodgingAssignment: "",finalAmount: null,
      settlementAmount: null,settlementStatus: "not_started",settlementNote: "" } };
  const retrieve = vi.fn().mockResolvedValue({ id: "cs_test_123", metadata: { memberId: "booker",pendingRegistrationId: "pending",eventSlug: "event" } });
  const deps: ReturnStatusDeps = { getStripe: () => ({ checkout: { sessions: { retrieve } } }) as unknown as Stripe,
    getPending: vi.fn().mockResolvedValue(undefined),getRegistrations: vi.fn().mockResolvedValue([row]),fulfill: vi.fn().mockResolvedValue({ status: "confirmed" }) };
  return { deps,retrieve };
}
describe("payer return authorization", () => {
  it("allows the booker’s proxy payment even when the attendee has no account", async () => {
    const { deps } = harness(); expect(await resolvePaymentReturnStatus("cs_test_123","booker",deps)).toBe("confirmed");
  });
  it("rejects another member and malformed sessions without fulfillment", async () => {
    const { deps,retrieve } = harness();
    expect(await resolvePaymentReturnStatus("bad","booker",deps)).toBe("invalid"); expect(retrieve).not.toHaveBeenCalled();
    expect(await resolvePaymentReturnStatus("cs_test_123","other",deps)).toBe("invalid"); expect(deps.fulfill).not.toHaveBeenCalled();
  });
  it("reports uncertain Stripe lookup instead of encouraging another payment", async () => {
    const { deps,retrieve } = harness(); retrieve.mockRejectedValue(new Error("network"));
    expect(await resolvePaymentReturnStatus("cs_test_123","booker",deps)).toBe("review");
  });
});
