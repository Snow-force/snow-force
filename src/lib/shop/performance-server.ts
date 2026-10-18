import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { diagnosticSchema, performanceSampleRate, sampledOperation, shopOperations, type ShopOperation } from "./performance-contract";

const phases = ["action", "auth", "read_validate", "cart.create", "commerce.fetch", "commerce.auth", "commerce.read", "commerce.edit", "commerce.line_items", "commerce.checkout", "commerce.preview", "commerce.commit", "commerce.other", "checkout.review", "checkout.commit", "checkout.prepare"] as const;
type Phase = typeof phases[number];
const allowedPhases = new Set<string>(phases);
type Scenario = "unknown" | "new" | "existing" | "coupon" | "payment_locked";
const context = new AsyncLocalStorage<{ operation: ShopOperation; operationId: string; active: boolean; sequence: number; scenario: Scenario }>();
export function setShopTimingScenario(scenario: Scenario) { const current = context.getStore(); if (current?.active) current.scenario = scenario; }
export function shopTimingHeaders(): Record<string, string> {
  const current = context.getStore();
  return current?.active ? { "x-snowforce-operation-id": current.operationId, "x-snowforce-operation": current.operation, "x-snowforce-scenario": current.scenario } : {};
}
export function commerceTimingPhase(path: string, method = "GET"): Phase {
  const resource = path.split("?")[0];
  if (resource.startsWith("/auth/") || resource === "/store/customers/me") return "commerce.auth";
  if (/\/edit$/.test(resource)) return "commerce.edit";
  if (method !== "GET" && /\/line-items(?:\/cali_[A-Za-z0-9]+)?$/.test(resource)) return "commerce.line_items";
  if (/\/preview$/.test(resource)) return "commerce.preview";
  if (/\/draft-commit$/.test(resource)) return "commerce.commit";
  if (resource.startsWith("/store/snowforce/checkout/")) return "commerce.checkout";
  return method === "GET" ? "commerce.read" : "commerce.other";
}
function outcome(value: unknown) {
  if (typeof value !== "object" || value === null || !("status" in value)) return "returned";
  const status = value.status;
  if (typeof status === "number") return status >= 200 && status < 400 ? "ok" : status >= 500 ? "error" : status >= 400 ? "rejected" : "returned";
  if (status === "unavailable") return "error";
  if (status === "processing") return "processing";
  if (typeof status === "string" && ["ready", "review", "preview", "payment", "complete", "editable", "recovered"].includes(status)) return "ok";
  return typeof status === "string" && ["invalid", "rejected", "signed-out", "not-configured", "sales-disabled", "checkout-locked", "stale-details", "estimate-unavailable", "empty"].includes(status) ? "rejected" : "returned";
}
export async function withShopTiming<T>(operation: ShopOperation, diagnostic: unknown, work: () => T | Promise<T>): Promise<T> {
  const rate = performanceSampleRate(process.env.SHOP_PERFORMANCE_TIMING, process.env.SHOP_PERFORMANCE_SAMPLE_RATE);
  if (!rate || !new Set<string>(shopOperations).has(operation)) return work();
  const parsed = diagnosticSchema.safeParse(diagnostic);
  const operationId = parsed.success ? parsed.data.operationId : randomUUID();
  if (!sampledOperation(operationId, rate)) return work();
  const current = { operation, operationId, active: true, sequence: 0, scenario: "unknown" as Scenario };
  return context.run(current, async () => {
    try { return await timeShopPhase("action", work); }
    finally { current.active = false; }
  });
}
export async function timeShopPhase<T>(phase: Phase, work: () => T | Promise<T>): Promise<T> {
  const current = context.getStore();
  if (!current?.active || !allowedPhases.has(phase)) return work();
  const startedAt = new Date().toISOString(), started = performance.now(), sequence = ++current.sequence;
  const emit = (result: string) => {
    if (!current.active) return;
    const revision = process.env.RAILWAY_GIT_COMMIT_SHA;
    try { console.info(JSON.stringify({ event: "snowforce.shop_performance", source: "web", operationId: current.operationId, operation: current.operation, scenario: current.scenario, sequence, phase, startedAt, durationMs: Math.max(0, Math.round(performance.now() - started)), outcome: result, ...(revision && /^[a-f0-9]{40}$/.test(revision) ? { revision } : {}) })); }
    catch { /* Diagnostics cannot alter a cart or payment result. */ }
  };
  try { const result = await work(); try { emit(outcome(result)); } catch { /* Result inspection is diagnostic only. */ } return result; }
  catch (error) { emit((error instanceof Error || error instanceof DOMException) && ["AbortError", "TimeoutError"].includes(error.name) ? "timeout" : "threw"); throw error; }
}
