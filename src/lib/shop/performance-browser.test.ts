import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { beginShopTiming, timeBrowserAction } from "./performance-browser";
import { browserTimingSchema, checkoutOperation, performanceSampleRate, sampledOperation } from "./performance-contract";
const operationId = "11111111-1111-4111-8111-000000000001";
const fetcher = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetcher); fetcher.mockReset().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal("matchMedia", () => ({ matches: false })); vi.spyOn(crypto, "randomUUID").mockReturnValue(operationId); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("requires explicit bounded sampling and creates no request while disabled", () => {
  expect(performanceSampleRate(undefined, undefined)).toBe(0); expect(performanceSampleRate("true", undefined)).toBe(.1);
  for (const rate of ["NaN", "Infinity", "-1", "2"]) expect(performanceSampleRate("true", rate)).toBe(0);
  expect(sampledOperation("pi_secret", 1)).toBe(false); expect(sampledOperation(operationId, 0)).toBe(false);
  expect(beginShopTiming(0, "cart.add")).toBeUndefined(); expect(fetcher).not.toHaveBeenCalled();
});
it("labels the checkout rollout cohort without transmitting SDK or checkout credentials", () => {
  beginShopTiming(1, "checkout.prepare", "unknown", undefined, "prewarm")?.report("payment.interactive");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({variant:"prewarm"});
  expect(browserTimingSchema.safeParse({...JSON.parse(fetcher.mock.calls[0][1].body),variant:"arbitrary"}).success).toBe(false);
});
it("sends only bounded primitive observations outside the mutation queue", async () => {
  const timing = beginShopTiming(1, "cart.add", "existing"); expect(timing).toBeDefined();
  const result = { status: "ready", clientSecret: "private-payment", address: "private-address" };
  expect(await timeBrowserAction(timing, async diagnostic => { expect(diagnostic).toEqual({ operationId }); return result; })).toBe(result);
  expect(fetcher).toHaveBeenCalledOnce(); const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe("/api/shop/performance"); expect(options.credentials).toBe("omit"); expect(options.keepalive).toBe(true);
  const body = JSON.parse(options.body); expect(browserTimingSchema.safeParse(body).success).toBe(true); expect(body).toMatchObject({ operationId, operation: "cart.add", phase: "action.return", outcome: "ok", scenario: "existing" }); expect(options.body).not.toContain("private-");
});
it("never changes successful or rejected actions when transport fails", async () => {
  fetcher.mockRejectedValue(Error("collector unavailable")); const timing = beginShopTiming(1, "checkout.prepare");
  expect(await timeBrowserAction(timing, async () => ({ status: "unavailable" }))).toEqual({ status: "unavailable" });
  const original = Error("original"); await expect(timeBrowserAction(timing, async () => { throw original; })).rejects.toBe(original);
  await Promise.resolve(); expect(fetcher).toHaveBeenCalledTimes(2);
});
it("records phase intervals independently and preserves thrown work", async () => {
  const timing = beginShopTiming(1, "checkout.prepare")!; expect(await timing.measure("payment.sdk", async () => 42)).toBe(42);
  const failure = Error("private"); await expect(timing.measure("payment.confirm", async () => { throw failure; })).rejects.toBe(failure);
  expect(fetcher.mock.calls.map(call => JSON.parse(call[1].body).outcome)).toEqual(["ok", "error"]);
});
it("ignores unavailable browser APIs and synchronous collection failures", async () => {
  vi.mocked(crypto.randomUUID).mockImplementationOnce(() => { throw Error("disabled crypto"); }); expect(beginShopTiming(1, "cart.add")).toBeUndefined();
  fetcher.mockImplementation(() => { throw Error("blocked network"); });
  expect(await timeBrowserAction(beginShopTiming(1, "cart.add"), async () => ({ status: "ready" }))).toEqual({ status: "ready" });
});
it("uses bounded viewport/network labels and classifies checkout actions without their private data", () => {
  vi.stubGlobal("navigator", { connection: { effectiveType: "3g" } }); vi.stubGlobal("matchMedia", () => ({ matches: true }));
  beginShopTiming(1, "checkout.preview")?.report("action.return"); expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ viewport: "mobile", network: "3g" });
  expect(checkoutOperation({ kind: "preview", address: "private" })).toBe("checkout.preview"); expect(checkoutOperation({ kind: "draft-payment" })).toBe("checkout.prepare"); expect(checkoutOperation({ kind: "payment" })).toBe("checkout.prepare"); expect(checkoutOperation({ kind: "complete" })).toBe("checkout.complete"); expect(checkoutOperation({ kind: "recover" })).toBe("checkout.change"); expect(checkoutOperation(null)).toBe("checkout.change");
});
it("attributes dispatch delay only for a unique matching resource, leaving queued ambiguity unknown", async () => {
  vi.useFakeTimers();
  const resource = { initiatorType: "fetch", name: window.location.href, startTime: 125 };
  const getEntriesByType = vi.fn().mockReturnValue([resource]);
  let now = 100;
  vi.stubGlobal("performance", { now: () => now, getEntriesByType });
  await timeBrowserAction(beginShopTiming(1, "cart.add"), async () => { now = 150; return { status: "ready" }; });
  await vi.runOnlyPendingTimersAsync();
  expect(fetcher.mock.calls.map(call => JSON.parse(call[1].body))).toEqual(expect.arrayContaining([expect.objectContaining({ phase: "action.send", durationMs: 25 })]));
  fetcher.mockClear(); now = 100; getEntriesByType.mockReturnValue([resource, { ...resource, startTime: 130 }]);
  await timeBrowserAction(beginShopTiming(1, "cart.add"), async () => { now = 150; return { status: "ready" }; });
  await vi.runOnlyPendingTimersAsync();
  expect(fetcher.mock.calls.map(call => JSON.parse(call[1].body).phase)).toEqual(["action.return"]);
});
