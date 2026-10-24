import { afterEach, beforeEach, expect, it, vi } from "vitest";
const dispatch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/registrations/v2/delivery", () => ({ dispatchWaiverOutbox: dispatch }));
import { POST } from "./route";
beforeEach(() => { dispatch.mockReset(); vi.stubEnv("EVENT_WAIVER_WORKER_SECRET", "s".repeat(32)); });
afterEach(() => vi.unstubAllEnvs());
it("denies unsigned, wrong and unconfigured worker requests before processing mail", async () => {
  for (const authorization of ["", "Bearer wrong", `Bearer ${"x".repeat(32)}`]) expect((await POST(new Request("https://snow-force.com/api/events/waivers/dispatch", { method: "POST", headers: { authorization } }))).status).toBe(401);
  expect(dispatch).not.toHaveBeenCalled();
});
it("processes a bounded batch for the configured worker and exposes recoverable failures", async () => {
  const request = () => new Request("https://snow-force.com/api/events/waivers/dispatch", { method: "POST", headers: { authorization: `Bearer ${"s".repeat(32)}` } });
  dispatch.mockResolvedValueOnce({ sent: 2, failed: 1 }).mockRejectedValueOnce(new Error("unavailable"));
  expect(await (await POST(request())).json()).toEqual({ sent: 2, failed: 1 }); expect(dispatch).toHaveBeenCalledWith(30);
  expect((await POST(request())).status).toBe(503);
});
