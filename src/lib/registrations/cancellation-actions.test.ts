vi.mock("@/lib/registrations/cancellation-mail", () => ({
  scheduleCancellationMail: vi.fn(),
  dispatchCancellationMail: async () => {},
}));
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  account: vi.fn(),
  admin: vi.fn(),
  rpc: vi.fn(),
  single: vi.fn(),
  refund: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/members/actions", () => ({
  getCurrentMemberAccount: m.account,
}));
vi.mock("@/lib/auth/admin", () => ({ requireSuperAdmin: m.admin }));
vi.mock("@/lib/payments/refund-actions", () => ({
  refundRegistrationAction: m.refund,
}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    rpc: m.rpc,
    from: () => {
      const q = { select: () => q, eq: () => q, single: m.single };
      return q;
    },
  }),
}));
import {
  requestCancellationAction,
  withdrawCancellationAction,
  reviewCancellationAction,
  executeCancellationRefundAction,
} from "./cancellation-actions";
function form(patch: Record<string, string> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    registrationId: "ticket",
    reason: "Cannot attend",
    confirmation: "REQUEST",
    ...patch,
  }))
    f.set(k, v);
  return f;
}
beforeEach(() => {
  vi.resetAllMocks();
  m.account.mockResolvedValue({
    profile: { id: "real-booker" },
    emailConfirmed: true,
  });
  m.admin.mockResolvedValue({ userId: "admin" });
  m.rpc.mockResolvedValue({ error: null });
  m.refund.mockResolvedValue({ success: true });
});
it("requires verified membership and a deliberate request; never calls Stripe", async () => {
  m.account.mockResolvedValueOnce(null);
  expect((await requestCancellationAction(form())).success).toBe(false);
  expect(
    (await requestCancellationAction(form({ confirmation: "", reason: "x" })))
      .success,
  ).toBe(false);
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.refund).not.toHaveBeenCalled();
});
it("binds request and withdrawal to the authenticated booker, not a submitted identity", async () => {
  expect(
    (await requestCancellationAction(form({ bookerId: "attacker" }))).success,
  ).toBe(true);
  expect(m.rpc).toHaveBeenCalledWith(
    "request_registration_cancellation",
    expect.objectContaining({ booker_id_input: "real-booker" }),
  );
  await withdrawCancellationAction("request");
  expect(m.rpc).toHaveBeenLastCalledWith("withdraw_registration_cancellation", {
    request_id_input: "request",
    booker_id_input: "real-booker",
  });
});
it("denies manager review and refund execution before database or Stripe access", async () => {
  m.admin.mockRejectedValue(new Error("admin-required"));
  await expect(reviewCancellationAction(form())).rejects.toThrow(
    "admin-required",
  );
  await expect(executeCancellationRefundAction(form())).rejects.toThrow(
    "admin-required",
  );
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.single).not.toHaveBeenCalled();
});
it("validates decision and does not call Stripe when approving", async () => {
  expect(
    (
      await reviewCancellationAction(
        form({
          decision: "approve",
          confirmation: "REVIEW",
          refundAmount: "99",
          note: "Full refund approved",
        }),
      )
    ).success,
  ).toBe(true);
  expect(m.rpc).toHaveBeenCalledWith(
    "review_registration_cancellation",
    expect.objectContaining({
      actor_id_input: "admin",
      refund_amount_input: 99,
    }),
  );
  expect(m.refund).not.toHaveBeenCalled();
  expect(
    (
      await reviewCancellationAction(
        form({ decision: "forged", confirmation: "REVIEW" }),
      )
    ).success,
  ).toBe(false);
});
it("uses only the saved approved refund amount and operation for retries", async () => {
  m.single.mockResolvedValue({
    data: {
      id: "request",
      status: "approved",
      registration_id: "ticket",
      refund_operation_id: "stable-operation",
      refund_amount: 99,
      decision_note: "Approved",
    },
    error: null,
  });
  const f = form({
    requestId: "request",
    confirmation: "REFUND",
    amount: "999",
    operationId: "forged",
  });
  await executeCancellationRefundAction(f);
  await executeCancellationRefundAction(f);
  for (const [sent] of m.refund.mock.calls) {
    expect(sent.get("amount")).toBe("99");
    expect(sent.get("operationId")).toBe("stable-operation");
    expect(sent.get("registrationId")).toBe("ticket");
  }
});
it("never executes an unapproved request or reports a failed RPC as success", async () => {
  m.single.mockResolvedValue({ data: { status: "pending" }, error: null });
  expect(
    (await executeCancellationRefundAction(form({ confirmation: "REFUND" })))
      .success,
  ).toBe(false);
  expect(m.refund).not.toHaveBeenCalled();
  m.rpc.mockResolvedValue({ error: { message: "locked" } });
  expect((await requestCancellationAction(form())).success).toBe(false);
});
