import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http";
import { z } from "zod";
import { trace } from "@medusajs/framework/opentelemetry/api";

const operation = z.enum(["cart.add", "cart.update", "cart.remove", "checkout.read", "checkout.preview", "checkout.prepare", "checkout.complete", "checkout.change"]);
const id = z.string().uuid();
function phase(path: string, method: string) {
  if (method !== "GET" && /\/line-items(?:\/[^/]+)?$/.test(path)) return "commerce.line_items";
  if (/\/edit$/.test(path)) return "commerce.edit";
  if (/\/draft-commit$/.test(path)) return "commerce.commit";
  if (/\/preview$/.test(path)) return "commerce.preview";
  if (path.startsWith("/store/snowforce/checkout/")) return "commerce.checkout";
  return method === "GET" ? "commerce.read" : "commerce.other";
}
/** A correlation header is diagnostic data, never ownership or write permission. */
export function observeShopRequest(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  if (process.env.COMMERCE_PERFORMANCE_TIMING !== "true") { next(); return; }
  const parsedId = id.safeParse(req.headers["x-snowforce-operation-id"]), parsedOperation = operation.safeParse(req.headers["x-snowforce-operation"]);
  if (!parsedId.success || !parsedOperation.success) { next(); return; }
  const rate = process.env.COMMERCE_PERFORMANCE_SAMPLE_RATE === undefined ? 0.1 : Number(process.env.COMMERCE_PERFORMANCE_SAMPLE_RATE);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1 || Number.parseInt(parsedId.data.replaceAll("-", "").slice(-8), 16) / 0x1_0000_0000 >= rate) { next(); return; }
  const startedAt = new Date().toISOString(), started = performance.now(), label = phase(req.path, req.method);
  const scenario = z.enum(["unknown", "new", "existing", "coupon", "payment_locked"]).safeParse(req.headers["x-snowforce-scenario"]);
  let activeTraceId: string | undefined;
  try {
    const active = trace.getActiveSpan();
    active?.setAttribute("snowforce.operation_id", parsedId.data);
    active?.setAttribute("snowforce.operation", parsedOperation.data);
    const value = active?.spanContext().traceId;
    if (value && /^[a-f0-9]{32}$/.test(value) && value !== "0".repeat(32)) activeTraceId = value;
  } catch { /* An absent or failed tracing SDK cannot alter commerce. */ }
  let emitted = false;
  const emit = (closed: boolean) => {
    if (emitted) return;
    emitted = true;
    const trace = req.headers.traceparent;
    const traceId = activeTraceId ?? (typeof trace === "string" && /^00-[a-f0-9]{32}-[a-f0-9]{16}-[a-f0-9]{2}$/.test(trace) ? trace.split("-")[1] : undefined);
    const revision = process.env.RAILWAY_GIT_COMMIT_SHA;
    try { console.info(JSON.stringify({ event: "snowforce.shop_performance", source: "commerce", operationId: parsedId.data, operation: parsedOperation.data, scenario: scenario.success ? scenario.data : "unknown", phase: label, startedAt, durationMs: Math.max(0, Math.round(performance.now() - started)), outcome: closed ? "connection_closed" : res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "rejected" : "returned", httpStatus: res.statusCode, ...(traceId ? { traceId } : {}), ...(revision && /^[a-f0-9]{40}$/.test(revision) ? { revision } : {}) })); } catch { /* Diagnostics never modify HTTP behavior. */ }
  };
  res.once("finish", () => emit(false));
  res.once("close", () => emit(!res.writableFinished));
  next();
}
