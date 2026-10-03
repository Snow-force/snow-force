import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), admin: vi.fn(), request: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: mocks.admin }));
import { previewOrderRows } from "@/lib/members/member-center-preview";
import { normalizeShopOrder } from "./member-orders";
import { orderSyncSnapshotSchema } from "./order-sync-contract";
import { saveOrderSnapshot, syncOwnedMemberOrder } from "./order-sync";
import { readBoundedOrderSyncBody, validOrderSyncSignature } from "./order-sync-signature";
import { POST } from "@/app/api/shop/order-sync/route";

const secret = "fixture-independent-bridge-secret".repeat(2);
const now = new Date("2026-10-01T06:30:00Z");
const timestamp = String(Math.floor(now.getTime() / 1000));
function snapshot() {
  return orderSyncSnapshotSchema.parse({ order: { ...previewOrderRows[0], id: "order_fixture", payment_status: "captured", fulfillment_status: "shipped" }, observedAt: now.toISOString() });
}
function request(body = JSON.stringify(snapshot()), time = timestamp, signature = createHmac("sha256", secret).update(`${time}.${body}`).digest("hex")) {
  return new Request("http://localhost/api/shop/order-sync", { method: "POST", headers: { "x-snowforce-timestamp": time, "x-snowforce-signature": signature }, body });
}

describe("trusted order projection boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); vi.stubEnv("COMMERCE_ORDER_SYNC_SECRET", secret);
    mocks.admin.mockReturnValue({ rpc: mocks.rpc }); mocks.rpc.mockResolvedValue({ data: true, error: null });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  it("keeps credit adjustments and exact rounded totals while preserving partial payment state", () => {
    const row = snapshot().order;
    const order = normalizeShopOrder({ ...row, credit_cents: 500, rounding_cents: -1, total_cents: row.total_cents - 501, payment_status: "partially_refunded" });
    expect(order.creditCents).toBe(500); expect(order.roundingCents).toBe(-1); expect(order.paymentStatus).toBe("partially_refunded");
    expect(() => normalizeShopOrder({ ...row, items: [{ ...row.items[0], returnedQuantity: 2 }] })).toThrow();
    expect(() => normalizeShopOrder({ ...row, rounding_cents: 4 })).toThrow();
  });
  it("rejects modified bodies, stale/future signatures, malformed hex and missing credentials", () => {
    const body = JSON.stringify(snapshot()), signature = request(body).headers.get("x-snowforce-signature");
    expect(validOrderSyncSignature(body, timestamp, signature, secret, now.getTime())).toBe(true);
    for (const values of [[body + " ", timestamp, signature, secret], [body, String(Number(timestamp) - 301), signature, secret], [body, String(Number(timestamp) + 301), signature, secret], [body, timestamp, "g".repeat(64), secret], [body, timestamp, signature, "short"], [body, null, signature, secret]]) {
      expect(validOrderSyncSignature(values[0]!, values[1], values[2], values[3]!, now.getTime())).toBe(false);
    }
  });
  it("bounds actual streamed bytes rather than trusting an absent or forged Content-Length", async () => {
    expect(await readBoundedOrderSyncBody(new Request("http://localhost", { method: "POST", body: "中文" }), 6)).toBe("中文");
    await expect(readBoundedOrderSyncBody(new Request("http://localhost", { method: "POST", headers: { "Content-Length": "1" }, body: "中文" }), 5)).rejects.toBeInstanceOf(RangeError);
    await expect(readBoundedOrderSyncBody(new Request("http://localhost", { method: "POST", headers: { "Content-Length": "100" }, body: "a" }), 5)).rejects.toBeInstanceOf(RangeError);
  });
  it("requires a native order, known owner, consistent amounts and exact wire fields before any write", async () => {
    for (const change of [{ user_id: null }, { id: "cart_fixture" }, { total_cents: 1 }, { extra: "secret" }]) await expect(saveOrderSnapshot({ ...snapshot(), order: { ...snapshot().order, ...change } })).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("writes only through the invoker RPC and fails safely when the database rejects the update", async () => {
    const value = snapshot(); await saveOrderSnapshot(value);
    expect(mocks.rpc).toHaveBeenCalledWith("shop_sync_member_order", { member_id: value.order.user_id, snapshot: value.order, observed_at: value.observedAt });
    mocks.rpc.mockResolvedValue({ error: { message: "private SQL data" } });
    await expect(saveOrderSnapshot(value)).rejects.toThrow("Order synchronization unavailable");
  });
  it("rechecks both order and immutable Supabase owner before using the privileged writer", async () => {
    const customer = { customerId: "cus_fixture", userId: snapshot().order.user_id, token: "trusted-token", email: "fixture@example.com", request: mocks.request };
    mocks.request.mockResolvedValue(snapshot()); await syncOwnedMemberOrder(customer, "order_fixture");
    expect(mocks.request).toHaveBeenCalledWith("/store/snowforce/orders/order_fixture", orderSyncSnapshotSchema, { token: "trusted-token" });
    mocks.rpc.mockClear();
    for (const order of [{ ...snapshot().order, user_id: "11111111-1111-4111-8111-111111111111" }, { ...snapshot().order, id: "order_other" }]) {
      mocks.request.mockResolvedValue({ ...snapshot(), order });
      await expect(syncOwnedMemberOrder(customer, "order_fixture")).rejects.toThrow();
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
    await expect(syncOwnedMemberOrder(customer, "../order_other")).rejects.toThrow();
  });
  it("authenticates before parsing and never accepts an unsigned projection", async () => {
    expect((await POST(request("not json", timestamp, "0".repeat(64)))).status).toBe(401);
    expect((await POST(request("not json"))).status).toBe(400);
    expect((await POST(request(JSON.stringify({ ...snapshot(), order: { ...snapshot().order, total_cents: 1 } })))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect((await POST(request())).status).toBe(200);
  });
  it("allows idempotent delivery and signals database failure for retry without exposing private details", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await POST(request())).status).toBe(200);
    mocks.rpc.mockRejectedValue(new Error("private connection details"));
    const result = await POST(request()); expect(result.status).toBe(503); expect(await result.text()).not.toContain("private");
    vi.stubEnv("COMMERCE_ORDER_SYNC_SECRET", ""); expect((await POST(request())).status).toBe(503);
  });
  it("rejects a signed future observation and excessive bodies before writing", async () => {
    expect((await POST(request(JSON.stringify({ ...snapshot(), observedAt: new Date(now.getTime() + 301_000).toISOString() })))).status).toBe(400);
    expect((await POST(request("a".repeat(512 * 1024 + 1)))).status).toBe(413);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
