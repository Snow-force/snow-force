"use client";

import { browserTimingSchema, sampledOperation, type BrowserTiming, type ShopOperation } from "./performance-contract";
type Phase = BrowserTiming["phase"];
type Outcome = BrowserTiming["outcome"];
export type ShopClientTiming = { operationId: string; report: (phase: Phase, outcome?: Outcome, since?: number) => void; observeActionSend?: () => void; measure: <T>(phase: Phase, work: () => Promise<T>) => Promise<T> };
const visits = new Set<ShopOperation>();
export function beginShopTiming(rate: number | undefined, operation: ShopOperation, scenario: BrowserTiming["scenario"] = "unknown", revision?: string, variant?: BrowserTiming["variant"]): ShopClientTiming | undefined {
  if (!rate || typeof window === "undefined") return;
  try {
    const operationId = crypto.randomUUID();
    if (!sampledOperation(operationId, rate)) return;
    const started = performance.now(), visit = visits.has(operation) ? "subsequent" : "initial";
    visits.add(operation);
    const connection = "connection" in navigator ? navigator.connection : undefined;
    const effective = typeof connection === "object" && connection !== null && "effectiveType" in connection ? connection.effectiveType : undefined;
    const network = ["slow-2g", "2g", "3g", "4g"].includes(String(effective)) ? effective : "unknown";
    const viewport = window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop";
    const actionUrl = new URL(window.location.href); actionUrl.hash = "";
    let sequence = 0;
    const emit = (phase: Phase, outcome: Outcome, durationMs: number) => {
      try {
        const parsed = browserTimingSchema.safeParse({ operationId, operation, scenario, ...(revision ? { revision } : {}), ...(variant ? { variant } : {}), phase, outcome, sequence: ++sequence, durationMs: Math.max(0, Math.round(durationMs)), viewport, network, visit });
        if (!parsed.success) return;
        // A separate bounded collector never joins Next's mutation action queue.
        void fetch("/api/shop/performance", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", keepalive: true, body: JSON.stringify(parsed.data) }).catch(() => undefined);
      } catch { /* Telemetry must not change UI or transaction behavior. */ }
    };
    const report = (phase: Phase, outcome: Outcome = "ok", since = started) => { try { emit(phase, outcome, performance.now() - since); } catch { /* Timing API failure is diagnostic only. */ } };
    const observeActionSend = () => {
      try {
      const ended = performance.now();
      // Flight can resolve before its resource entry is posted. Observe on the
      // next turn, retaining the original completion cutoff for queued actions.
      window.setTimeout(() => {
      try {
        const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        const matching = entries.filter(entry => entry.initiatorType === "fetch" && entry.startTime >= started && entry.startTime <= ended && entry.name === actionUrl.href);
        // Next actions share a URL and may queue. Attribute a dispatch only when
        // exactly one fetch is observed; ambiguous/missing entries stay unknown.
        if (matching.length === 1) emit("action.send", "ok", matching[0].startTime - started);
      } catch { /* Resource Timing is optional; no fabricated dispatch duration. */ }
      }, 0);
      } catch { /* Optional observation cannot change the resolved action. */ }
    };
    return { operationId, report, observeActionSend, measure: async (phase, work) => { const at = performance.now(); try { const result = await work(); report(phase, "ok", at); return result; } catch (error) { report(phase, "error", at); throw error; } } };
  } catch { return; }
}
export async function timeBrowserAction<T extends { status: string }>(timing: ShopClientTiming | undefined, work: (diagnostic?: { operationId: string }) => Promise<T>): Promise<T> {
  try { const result = await work(timing ? { operationId: timing.operationId } : undefined); timing?.observeActionSend?.(); timing?.report("action.return", ["ready", "review", "preview", "payment", "complete"].includes(result.status) ? "ok" : result.status === "unavailable" ? "error" : result.status === "processing" ? "processing" : "rejected"); return result; }
  catch (error) { timing?.observeActionSend?.(); timing?.report("action.return", "error"); throw error; }
}
