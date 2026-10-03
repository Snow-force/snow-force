import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ client: vi.fn(), session: vi.fn(), sync: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("./commerce-auth", () => ({ getCommerceCustomerSession: mocks.session }));
vi.mock("./order-sync", () => ({ syncOwnedMemberOrder: mocks.sync }));
import { createMemberOrderRepository } from "./member-order-repository";
import { previewOrderRows } from "@/lib/members/member-center-preview";
import { CommerceNotFoundError } from "./commerce-client";
const owner = previewOrderRows[0].user_id!;
const row = { ...previewOrderRows[0], id: "order_fixture" };
describe("authoritative member detail refresh", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const query = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.single };
    mocks.client.mockResolvedValue({ from: mocks.from }); mocks.from.mockReturnValue(query); mocks.select.mockReturnValue(query); mocks.eq.mockReturnValue(query);
    mocks.single.mockResolvedValue({ data: row, error: null }); mocks.session.mockResolvedValue({ userId: owner });
  });
  it("refreshes a native order with the verified customer before reading the owner-filtered projection", async () => {
    expect((await createMemberOrderRepository().get(owner, "order_fixture")).state).toBe("ready");
    expect(mocks.sync).toHaveBeenCalledWith({ userId: owner }, "order_fixture");
    expect(mocks.eq.mock.calls).toEqual([["user_id", owner], ["id", "order_fixture"]]);
    expect(mocks.sync.mock.invocationCallOrder[0]).toBeLessThan(mocks.single.mock.invocationCallOrder[0]);
  });
  it("does not show a stale detail if the authoritative refresh fails or the account changed", async () => {
    mocks.sync.mockRejectedValue(new Error("backend unavailable"));
    expect((await createMemberOrderRepository().get(owner, "order_fixture")).state).toBe("unavailable");
    expect(mocks.from).not.toHaveBeenCalled();
    mocks.sync.mockReset(); mocks.session.mockResolvedValue({ userId: "11111111-1111-4111-8111-111111111111" });
    expect((await createMemberOrderRepository().get(owner, "order_fixture")).state).toBe("unavailable");
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("keeps a nonexistent or foreign native order unavailable to the member without reading a cached row", async () => {
    mocks.sync.mockRejectedValue(new CommerceNotFoundError());
    expect((await createMemberOrderRepository().get(owner, "order_fixture")).state).toBe("not-found");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
