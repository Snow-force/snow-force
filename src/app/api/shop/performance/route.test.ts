import { afterEach, beforeEach, expect, it, vi } from "vitest";
let POST: typeof import("./route").POST;
const event = { operationId: "11111111-1111-4111-8111-000000000001", operation: "cart.add", phase: "action.return", durationMs: 123, outcome: "ok", sequence: 1, viewport: "mobile", network: "3g", visit: "initial" };
const request = (body: unknown = event, headers = {}) => new Request("https://snow-force.com/api/shop/performance", { method: "POST", headers: { origin: "https://snow-force.com", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
beforeEach(async () => { vi.resetModules(); vi.stubEnv("SHOP_PERFORMANCE_TIMING", "true"); vi.stubEnv("SHOP_PERFORMANCE_SAMPLE_RATE", "1"); vi.spyOn(console, "info").mockImplementation(() => {}); POST = (await import("./route")).POST; });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("disables collection without reading or logging request bodies", async () => { vi.stubEnv("SHOP_PERFORMANCE_TIMING", "false"); expect((await POST(request({ secret: "never" }))).status).toBe(204); expect(console.info).not.toHaveBeenCalled(); });
it("accepts same-origin typed observations without cookies or user identifiers", async () => { expect((await POST(request())).status).toBe(204); expect(JSON.parse(vi.mocked(console.info).mock.calls[0][0])).toMatchObject({ ...event, source: "browser", event: "snowforce.shop_performance" }); });
it("rejects cross-origin, free-form fields, secrets, unbounded times and forged labels", async () => {
  expect((await POST(request(event, { origin: "https://attacker.invalid" }))).status).toBe(403);
  expect((await POST(request(event, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
  expect((await POST(request(event, { "content-type": "text/plain" }))).status).toBe(415);
  for (const body of [{ ...event, clientSecret: "private" }, { ...event, phase: "private-address" }, { ...event, operationId: "cart_other" }, { ...event, durationMs: -1 }, { ...event, durationMs: 1_800_001 }]) expect((await POST(request(body))).status).toBe(400);
  expect(console.info).not.toHaveBeenCalled();
});
it("enforces the body cap even without a Content-Length header", async () => { expect((await POST(request({ private: "x".repeat(4096) }))).status).toBe(413); expect((await POST(request(event, { "content-length": "9999" }))).status).toBe(413); expect(console.info).not.toHaveBeenCalled(); });
it("rejects malformed JSON, missing bodies and unselected operation IDs without logs", async () => {
  expect((await POST(new Request("https://snow-force.com/api/shop/performance", { method: "POST", headers: { origin: "https://snow-force.com", "content-type": "application/json" }, body: "{" }))).status).toBe(400);
  expect((await POST(new Request("https://snow-force.com/api/shop/performance", { method: "POST", headers: { origin: "https://snow-force.com", "content-type": "application/json" } }))).status).toBe(400);
  vi.stubEnv("SHOP_PERFORMANCE_SAMPLE_RATE", ".1"); expect((await POST(request({ ...event, operationId: "11111111-1111-4111-8111-ffffffffffff" }))).status).toBe(400); expect(console.info).not.toHaveBeenCalled();
});
it("caps per-process log volume and ignores logger outages", async () => {
  vi.mocked(console.info).mockImplementation(() => { throw Error("logger down"); });
  for (let i = 0; i < 600; i++) expect((await POST(request())).status).toBe(204);
  expect((await POST(request())).status).toBe(429);
});
