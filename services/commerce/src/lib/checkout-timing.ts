import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

const operations = ["tax.refresh", "checkout.details", "checkout.shipping"] as const;
const phases = [...operations, "tax.cart.initial", "tax.reuse", "tax.pending", "tax.withdraw", "tax.normalize", "tax.create", "tax.apply", "tax.cart.final", "tax.setup.final", "tax.proof.final",
  "source.owner", "source.cart.initial", "source.region.initial", "source.shipping.initial", "source.classification.initial", "source.setup", "source.config.initial",
  "source.cart.final", "source.region.final", "source.shipping.final", "source.classification.final", "source.config.final",
  "details.owner.initial", "details.withdraw", "details.owner.final", "details.native-save",
  "shipping.owner", "shipping.inventory", "shipping.delivery-types", "shipping.pricing"] as const;
type Operation = typeof operations[number];
type Phase = typeof phases[number];
const allowedOperations = new Set<string>(operations), allowedPhases = new Set<string>(phases);
type TimingContext = { operationId: string; active: boolean; sequence: number };
const timing = new AsyncLocalStorage<TimingContext>();

/** Opt-in diagnostics only: no cart, customer, address, money, provider data or
 * error text is recorded. A fresh context belongs to this awaited operation;
 * escaped background work cannot keep attributing events to a finished request.
 */
export async function withCheckoutTiming<T>(operation: Operation, work: () => T | Promise<T>): Promise<T> {
  if (process.env.COMMERCE_CHECKOUT_TIMING !== "true" || !allowedOperations.has(operation)) return work();
  const context: TimingContext = { operationId: randomUUID(), active: true, sequence: 0 };
  return timing.run(context, async () => {
    try { return await timeCheckoutPhase(operation, work); }
    finally { context.active = false; }
  });
}

export async function timeCheckoutPhase<T>(phase: Phase, work: () => T | Promise<T>): Promise<T> {
  const context = timing.getStore();
  if (!context?.active || !allowedPhases.has(phase)) return work();
  const startedAt = new Date().toISOString(), started = performance.now(), sequence = ++context.sequence;
  const emit = (outcome: "returned" | "threw") => {
    if (!context.active) return;
    try {
      console.info(JSON.stringify({ event: "snowforce.checkout_timing", operationId: context.operationId, sequence, phase, startedAt,
        durationMs: Math.max(0, Math.round((performance.now() - started) * 1000) / 1000), outcome }));
    } catch { /* Diagnostic transport must never change a cart mutation's result. */ }
  };
  try { const result = await work(); emit("returned"); return result; }
  catch (error) { emit("threw"); throw error; }
}
