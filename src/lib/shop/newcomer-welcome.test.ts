import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ policy: vi.fn(), claim: vi.fn() }));
vi.mock("./newcomer", () => ({ getNewcomerPolicy: mocks.policy }));
vi.mock("./newcomer-actions", () => ({ claimNewcomerAction: mocks.claim }));
import { queueMemberWelcome } from "./newcomer-welcome";
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("NEWCOMER_SIGNING_SECRET", "welcome-fixture-signing-secret-over-32"); mocks.policy.mockResolvedValue({ value: 10 }); mocks.claim.mockResolvedValue({ status: "ready" }); });
it("queues the benefit through the verified commerce session for every allowed post-auth destination", async () => { await queueMemberWelcome("/events/trip"); expect(mocks.claim).toHaveBeenCalledOnce(); });
it("waits for privacy consent and never runs for merchant callbacks or an inactive offer", async () => {
  await queueMemberWelcome("/member/consent?next=/events/trip"); await queueMemberWelcome("/merchant/dashboard"); expect(mocks.policy).not.toHaveBeenCalled();
  mocks.policy.mockResolvedValue(null); await queueMemberWelcome("/member"); expect(mocks.claim).not.toHaveBeenCalled();
  vi.stubEnv("NEWCOMER_SIGNING_SECRET", ""); mocks.policy.mockClear(); await queueMemberWelcome("/member"); expect(mocks.policy).not.toHaveBeenCalled();
});
it("retains member access on queue failure and logs only a generic operational message", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.claim.mockResolvedValueOnce({ status: "unavailable" }); await expect(queueMemberWelcome("/member")).resolves.toBeUndefined();
    mocks.claim.mockRejectedValueOnce(new Error("private token and email")); await expect(queueMemberWelcome("/member")).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(2); expect(JSON.stringify(error.mock.calls)).not.toContain("private token");
  } finally { error.mockRestore(); }
});
