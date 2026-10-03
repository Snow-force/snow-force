import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { createClient } from "@/lib/supabase/server";
import { previewOrderRows, previewUser } from "@/lib/members/member-center-preview";
import { createMemberOrderRepository, parseOrderPage, type MemberOrderSource } from "./member-order-repository";

const userId = previewUser.id;
const otherUserId = "10000000-0000-4000-8000-000000000002";
const source = (overrides: Partial<MemberOrderSource> = {}): MemberOrderSource => ({
  list: vi.fn(async () => ({ data: [previewOrderRows[0]], error: null, count: 1 })),
  get: vi.fn(async () => ({ data: previewOrderRows[0], error: null })),
  ...overrides,
});

describe("member order repository", () => {
  it("distinguishes an empty account from a database error", async () => {
    const empty = createMemberOrderRepository(source({ list: async () => ({ data: [], error: null, count: 0 }) }));
    expect(await empty.list(userId)).toMatchObject({ state: "ready", count: 0, orders: [] });
    const failed = createMemberOrderRepository(source({ list: async () => ({ data: null, error: new Error("private details"), count: null }) }));
    expect(await failed.list(userId)).toEqual({ state: "unavailable", orders: [], count: null, page: 1, hasMore: false });
  });
  it("fails closed if the source returns another user's orders", async () => {
    const repo = createMemberOrderRepository(source({ list: async () => ({ data: [{ ...previewOrderRows[0], user_id: otherUserId }], error: null, count: 1 }) }));
    expect((await repo.list(userId)).state).toBe("unavailable");
    expect(await createMemberOrderRepository(source()).get(otherUserId, previewOrderRows[0].id)).toEqual({ state: "not-found" });
  });
  it("does not read orders without an authenticated user or with malformed IDs", async () => {
    const fake = source(); const repo = createMemberOrderRepository(fake);
    expect((await repo.list("")).state).toBe("unavailable");
    expect(await repo.get(userId, "../../other-order")).toEqual({ state: "not-found" });
    expect(fake.list).not.toHaveBeenCalled(); expect(fake.get).not.toHaveBeenCalled();
  });
  it("reports invalid detail data and thrown reads as unavailable without leaking internals", async () => {
    const invalid = createMemberOrderRepository(source({ get: async () => ({ data: { ...previewOrderRows[0], currency: "cny" }, error: null }) }));
    expect(await invalid.get(userId, previewOrderRows[0].id)).toEqual({ state: "unavailable" });
    const failed = createMemberOrderRepository(source({ get: async () => { throw new Error("private database detail"); } }));
    expect(await failed.get(userId, previewOrderRows[0].id)).toEqual({ state: "unavailable" });
  });
  it("separates missing records, errors and valid details", async () => {
    expect((await createMemberOrderRepository(source()).get(userId, previewOrderRows[0].id)).state).toBe("ready");
    expect(await createMemberOrderRepository(source({ get: async () => ({ data: null, error: null }) })).get(userId, "ord_missing")).toEqual({ state: "not-found" });
    expect(await createMemberOrderRepository(source({ get: async () => ({ data: null, error: "failed" }) })).get(userId, "ord_missing")).toEqual({ state: "unavailable" });
  });
  it("uses the existing Supabase client with owner, status and pagination constraints", async () => {
    const chain = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), range: vi.fn(async () => ({ data: [previewOrderRows[0]], error: null, count: 25 })), maybeSingle: vi.fn(async () => ({ data: previewOrderRows[0], error: null })) };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.in.mockReturnValue(chain); chain.order.mockReturnValue(chain);
    const from = vi.fn(() => chain);
    vi.mocked(createClient).mockResolvedValue({ from } as unknown as Awaited<ReturnType<typeof createClient>>);
    const repo = createMemberOrderRepository();
    expect(await repo.list(userId, "shipped", 2)).toMatchObject({ state: "ready", page: 2, hasMore: true, count: 25 });
    expect(from).toHaveBeenCalledWith("shop_member_orders");
    expect(chain.eq).toHaveBeenCalledWith("user_id", userId);
    expect(chain.in).toHaveBeenCalledWith("status", ["shipped"]);
    expect(chain.range).toHaveBeenCalledWith(10, 19);
    await repo.get(userId, previewOrderRows[0].id);
    expect(chain.eq).toHaveBeenCalledWith("id", previewOrderRows[0].id);
  });
  it("bounds untrusted pagination", () => {
    expect(parseOrderPage("0")).toBe(1); expect(parseOrderPage("-1")).toBe(1);
    expect(parseOrderPage("Infinity")).toBe(1); expect(parseOrderPage("1.5")).toBe(1);
    expect(parseOrderPage("9999999999999")).toBe(10000); expect(parseOrderPage("2")).toBe(2);
  });
});
