import { z } from "zod";

export const shopOperations = ["cart.add", "cart.update", "cart.remove", "checkout.read", "checkout.preview", "checkout.prepare", "checkout.complete", "checkout.change"] as const;
export type ShopOperation = typeof shopOperations[number];
export const diagnosticSchema = z.object({ operationId: z.string().uuid() }).strict();
export const browserTimingSchema = diagnosticSchema.extend({
  operation: z.enum(shopOperations),
  phase: z.enum(["action.send", "action.return", "payment.mount", "payment.sdk", "payment.element_ready", "payment.interactive", "payment.confirm", "payment.order"]),
  outcome: z.enum(["ok", "returned", "rejected", "error", "timeout", "processing", "authorized", "succeeded"]),
  durationMs: z.number().finite().min(0).max(1_800_000),
  sequence: z.number().int().min(1).max(100),
  viewport: z.enum(["mobile", "desktop"]),
  network: z.enum(["slow-2g", "2g", "3g", "4g", "unknown"]),
  visit: z.enum(["initial", "subsequent"]),
  scenario: z.enum(["unknown", "new", "existing", "coupon", "payment_locked"]).default("unknown"),
  revision: z.string().regex(/^[a-f0-9]{40}$/).optional(),
  variant: z.enum(["baseline", "prewarm"]).optional(),
}).strict();
export type BrowserTiming = z.infer<typeof browserTimingSchema>;
export function performanceSampleRate(enabled: string | undefined, rawRate: string | undefined) {
  if (enabled !== "true") return 0;
  const rate = rawRate === undefined ? 0.1 : Number(rawRate);
  return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 0;
}
export function sampledOperation(operationId: string, rate: number) {
  return z.string().uuid().safeParse(operationId).success && rate > 0 && Number.isFinite(rate) && rate <= 1 && Number.parseInt(operationId.replaceAll("-", "").slice(-8), 16) / 0x1_0000_0000 < rate;
}
export function checkoutOperation(input: unknown): ShopOperation {
  const kind = z.object({ kind: z.string() }).safeParse(input);
  if (!kind.success) return "checkout.change";
  if (kind.data.kind === "preview") return "checkout.preview";
  if (["payment", "draft-payment"].includes(kind.data.kind)) return "checkout.prepare";
  return kind.data.kind === "complete" ? "checkout.complete" : "checkout.change";
}
