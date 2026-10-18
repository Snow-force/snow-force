import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { commerceTimingPhase, setShopTimingScenario, shopTimingHeaders, timeShopPhase, withShopTiming } from "./performance-server";
import { createCommerceClient } from "./commerce-client";
import { z } from "zod";
const operationId = "11111111-1111-4111-8111-000000000001";
let events: Record<string, unknown>[];
beforeEach(() => { vi.stubEnv("SHOP_PERFORMANCE_TIMING", "true"); vi.stubEnv("SHOP_PERFORMANCE_SAMPLE_RATE", "1"); events = []; vi.spyOn(console, "info").mockImplementation(line => { events.push(JSON.parse(line)); }); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("is disabled by default and does not propagate unsolicited diagnostics", async () => {
  for (const flag of ["false", "TRUE", "", "1"]) { vi.stubEnv("SHOP_PERFORMANCE_TIMING", flag); expect(await withShopTiming("cart.add", { operationId }, () => timeShopPhase("auth", () => shopTimingHeaders()))).toEqual({}); }
  expect(events).toEqual([]);
});
it("correlates independent phases and headers without logging returned private data", async () => {
  const privateResult = { status: "ready", address: "private-address", secret: "private-secret" };
  expect(await withShopTiming("cart.add", { operationId }, async () => {
    expect(shopTimingHeaders()).toMatchObject({ "x-snowforce-operation-id": operationId, "x-snowforce-operation": "cart.add" });
    await timeShopPhase("auth", () => true); setShopTimingScenario("coupon");
    return timeShopPhase("commerce.line_items", () => privateResult);
  })).toBe(privateResult);
  expect(events.map(e => e.phase)).toEqual(["auth", "commerce.line_items", "action"]);
  expect(events.every(e => e.operationId === operationId)).toBe(true);
  expect(events.at(-1)).toMatchObject({ scenario: "coupon", outcome: "ok" });
  expect(JSON.stringify(events)).not.toContain("private-"); expect(shopTimingHeaders()).toEqual({});
});
it("preserves results and exception identity even when diagnostics fail", async () => {
  vi.mocked(console.info).mockImplementation(() => { throw Error("transport"); });
  expect(await withShopTiming("checkout.read", { operationId }, () => 7)).toBe(7);
  const original = new Error("private-failure"); await expect(withShopTiming("checkout.prepare", { operationId }, () => { throw original; })).rejects.toBe(original);
  const result = { get status(): string { throw original; } };
  expect(await withShopTiming("checkout.read", { operationId }, () => result)).toBe(result);
});
it("records real fetch timeouts and distinguishes returned errors from payment processing", async () => {
  const error = new DOMException("private-body", "TimeoutError");
  await expect(withShopTiming("cart.add", { operationId }, () => timeShopPhase("commerce.fetch", () => { throw error; }))).rejects.toBe(error);
  expect(events.every(e => e.outcome === "timeout")).toBe(true); expect(JSON.stringify(events)).not.toContain("private-body");
  await withShopTiming("checkout.read", { operationId }, () => ({ status: "unavailable" })); expect(events.at(-1)?.outcome).toBe("error");
  await withShopTiming("checkout.complete", { operationId }, () => ({ status: "processing" })); expect(events.at(-1)?.outcome).toBe("processing");
});
it("isolates concurrent requests and stops escaped background attribution", async () => {
  let release = () => {}; const gate = new Promise<void>(resolve => { release = resolve; }); let escaped: Promise<unknown> | undefined;
  await Promise.all([withShopTiming("cart.add", { operationId }, async () => { await gate; expect(shopTimingHeaders()["x-snowforce-operation-id"]).toBe(operationId); escaped = new Promise(resolve => setTimeout(() => { void timeShopPhase("auth", () => 1).then(resolve); }, 0)); }), withShopTiming("checkout.read", { operationId: "22222222-2222-4222-8222-000000000002" }, () => { release(); return 2; })]);
  const count = events.length; await escaped; expect(events).toHaveLength(count);
  expect(new Set(events.map(e => e.operationId)).size).toBe(2);
});
it("classifies fixed phases without logging IDs, queries or arbitrary labels", () => {
  expect(commerceTimingPhase("/store/carts/cart_private/line-items?fields=secret", "POST")).toBe("commerce.line_items");
  expect(commerceTimingPhase("/store/snowforce/checkout/cart_private/edit", "POST")).toBe("commerce.edit");
  expect(commerceTimingPhase("/auth/customer/supabase", "POST")).toBe("commerce.auth");
  expect(commerceTimingPhase("/store/products?secret=never-log")).toBe("commerce.read");
});
it("propagates the same correlation ID through actual commerce transport without putting credentials into logs", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  const client = createCommerceClient({ backendUrl: "https://commerce.example.test", publishableKey: "private-key-marker" }, fetcher);
  await withShopTiming("cart.add", { operationId }, () => client("/store/carts/cart_private/line-items", z.object({ ok: z.boolean() }), { method: "POST", token: "private-token-marker", body: { variant_id: "variant_private", quantity: 1 } }));
  expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: expect.objectContaining({ "x-snowforce-operation-id": operationId, "x-snowforce-operation": "cart.add", Authorization: "Bearer private-token-marker" }) }));
  expect(events.map(event => event.phase)).toEqual(["commerce.fetch", "commerce.line_items", "action"]); expect(JSON.stringify(events)).not.toMatch(/private|variant_|cart_/);
  expect(events.map(event => event.outcome)).toEqual(["ok", "returned", "returned"]);
});
it("does not confuse successful HTTP or native edit responses with business rejection", async () => {
  for (const [value, expected] of [[new Response(null, { status: 204 }), "ok"], [new Response(null, { status: 409 }), "rejected"], [new Response(null, { status: 503 }), "error"], [{ status: "editable" }, "ok"], [{ status: "private-unknown" }, "returned"]] as const) {
    await withShopTiming("cart.add", { operationId }, () => value); expect(events.at(-1)?.outcome).toBe(expected);
  }
});
it("rejects runtime diagnostic labels, ignores escaped phases and uses a fresh safe ID for malformed hints", async () => {
  expect(await Reflect.apply(withShopTiming, undefined, ["private-label", { operationId }, () => 3])).toBe(3); expect(events).toHaveLength(0);
  await withShopTiming("cart.add", { operationId: "private-secret" }, () => Reflect.apply(timeShopPhase, undefined, ["private-phase", () => 4]));
  expect(events).toHaveLength(1); expect(events[0].operationId).toMatch(/^[a-f0-9-]{36}$/); expect(JSON.stringify(events)).not.toContain("private-");
  expect(await timeShopPhase("auth", () => 5)).toBe(5); expect(events).toHaveLength(1);
  vi.stubEnv("SHOP_PERFORMANCE_SAMPLE_RATE", ".1");
  expect(await withShopTiming("cart.add", { operationId: "11111111-1111-4111-8111-ffffffffffff" }, () => 6)).toBe(6); expect(events).toHaveLength(1);
});
