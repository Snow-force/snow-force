import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn(), select: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
import { flagPaidPendingForReview, getPaidPendingReviews } from "./payment-review";
beforeEach(() => { vi.clearAllMocks(); mocks.from.mockReturnValue(mocks); mocks.update.mockReturnValue(mocks);
  mocks.select.mockReturnValue(mocks); mocks.eq.mockReturnValue(mocks); mocks.is.mockReturnValue(mocks); });
describe("paid review tracking", () => {
  it("persists the review marker and emits only an opaque pending reference", async () => {
    mocks.eq.mockResolvedValue({ error: null });
    const log = vi.spyOn(console,"error").mockImplementation(() => {});
    await flagPaidPendingForReview("pending");
    expect(mocks.update).toHaveBeenCalledWith({ fulfillment_state: "paid_requires_review" });
    expect(log).toHaveBeenCalledWith("paid_requires_review", { pendingId: "pending" }); log.mockRestore();
  });
  it("surfaces review persistence failures", async () => {
    mocks.eq.mockResolvedValue({ error: { message: "down" } });
    await expect(flagPaidPendingForReview("pending")).rejects.toThrow("paid_review_tracking_failed");
  });
  it("loads the unresolved staff queue without attendee PII", async () => {
    mocks.order.mockResolvedValue({ data: [{ id: "pending",event_slug: "ride",member_id: "booker",created_at: "2026-10-22" }], error: null });
    expect(await getPaidPendingReviews()).toHaveLength(1);
    expect(mocks.select).toHaveBeenCalledWith("id,event_slug,member_id,created_at");
    expect(mocks.is).toHaveBeenCalledWith("fulfilled_registration_id",null);
  });
});
