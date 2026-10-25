import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";

it("runs a bounded recovery request without logging credentials, and reports failures", async () => {
  const source = readFileSync("scripts/railway-event-waiver-worker.mjs", "utf8");
  const run = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<void>;
  const execute = new run("process", "fetch", "AbortSignal", "console", source);
  const log = { info: vi.fn(), error: vi.fn() };
  const request = vi.fn(async () => ({ ok: true, json: async () => ({ sent: 2, failed: 0 }) }));
  const processFixture = { env: { EVENT_WAIVER_WORKER_SECRET: "private-worker-key" }, exitCode: 0 };
  await execute(processFixture, request, AbortSignal, log);
  expect(request).toHaveBeenCalledWith("https://snow-force.com/api/events/waivers/dispatch", expect.objectContaining({ method: "POST", headers: { authorization: "Bearer private-worker-key" }, signal: expect.any(AbortSignal) }));
  expect(log.info).toHaveBeenCalledWith('{"sent":2,"failed":0}');
  request.mockRejectedValueOnce(new Error("provider response includes private-worker-key"));
  await execute(processFixture, request, AbortSignal, log);
  expect(processFixture.exitCode).toBe(1);
  expect(JSON.stringify(log.error.mock.calls)).not.toContain("private-worker-key");
});
