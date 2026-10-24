import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ after: vi.fn(), queue: vi.fn(), dispatch: vi.fn() }));
vi.mock("next/server", () => ({ after: m.after }));
vi.mock("./delivery", () => ({ queueRegistrationWaiver: m.queue, dispatchWaiverOutbox: m.dispatch }));
import { scheduleRegistrationWaiver, scheduleWaiverDelivery } from "./schedule";
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("EVENT_WAIVER_ENCRYPTION_KEY", ""); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("leaves default-off V1 processing alone and sends after the registration response", async () => {
  await scheduleRegistrationWaiver("ticket"); expect(m.after).not.toHaveBeenCalled();
  vi.stubEnv("EVENT_WAIVER_ENCRYPTION_KEY", "b".repeat(64)); await scheduleRegistrationWaiver("ticket");
  expect(m.queue).not.toHaveBeenCalled(); await m.after.mock.calls[0][0]();
  expect(m.queue).toHaveBeenCalledWith("ticket"); expect(m.dispatch).toHaveBeenCalledWith(10);
});
it("keeps delivery failure recoverable without logging private tokens, addresses or provider errors", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  m.dispatch.mockRejectedValue(new Error("private provider failure")); scheduleWaiverDelivery(); await m.after.mock.calls[0][0]();
  expect(log).toHaveBeenCalledExactlyOnceWith("[waiver] delivery deferred; durable queue retained");
});
