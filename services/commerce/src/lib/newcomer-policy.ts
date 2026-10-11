import { createHash } from "node:crypto";
import { z } from "zod";
import type { CreatePromotionDTO } from "@medusajs/framework/types";

export const newcomerPolicySchema = z.object({
  type: z.literal("percentage"), value: z.number().refine(value => value === 10),
  minimum: z.number().refine(value => value === 0), days: z.number().int().min(1).max(365),
  eligibility: z.enum(["new_accounts", "no_orders"]), registeredAfter: z.iso.datetime().nullable(),
}).strict().refine(p => p.type !== "percentage" || p.value <= 100)
  .refine(p => Number(p.value.toFixed(2)) === p.value && Number(p.minimum.toFixed(2)) === p.minimum)
  .refine(p => p.eligibility !== "new_accounts" || p.registeredAfter !== null);
export type NewcomerPolicy = z.infer<typeof newcomerPolicySchema>;
/** Native admin edits must not silently turn a welcome percentage into a cash discount. */
export function hasNewcomerEconomics(promotion: unknown): boolean {
  return z.object({
    limit: z.literal(1),
    application_method: z.object({ type: z.literal("percentage"), value: z.coerce.number().refine(value => value === 10),
      target_type: z.literal("items"), allocation: z.literal("each"), currency_code: z.literal("usd") }),
  }).safeParse(promotion).success;
}
export function newcomerPolicy(env: NodeJS.ProcessEnv = process.env): NewcomerPolicy | null {
  if (env.NEWCOMER_ENABLED !== "true") return null;
  const parsed = newcomerPolicySchema.safeParse({ type: env.NEWCOMER_DISCOUNT_TYPE ?? "percentage",
    value: Number(env.NEWCOMER_DISCOUNT_VALUE ?? "10"), minimum: Number(env.NEWCOMER_MINIMUM_USD ?? "0"),
    days: Number(env.NEWCOMER_VALID_DAYS), eligibility: env.NEWCOMER_ELIGIBILITY,
    registeredAfter: env.NEWCOMER_REGISTERED_AFTER ?? null });
  // Missing configuration never advertises an offer or creates free merchandise.
  if (!parsed.success || (env.NEWCOMER_SIGNING_SECRET?.length ?? 0) < 32) return null;
  return parsed.data;
}
export function newcomerCode(userId: string) {
  return `WELCOME-${createHash("sha256").update(`snowforce.newcomer.v1.${z.uuid().parse(userId)}`).digest("hex").slice(0, 32).toUpperCase()}`;
}
export function newcomerPromotion(userId: string, customerId: string, policy: NewcomerPolicy, now: Date): CreatePromotionDTO {
  const code = newcomerCode(userId);
  return { code, type: "standard", status: "active", is_automatic: false, limit: 1,
    application_method: { type: "percentage", target_type: "items", allocation: "each", value: 10, currency_code: "usd",
      target_rules: [{ attribute: "snowforce_regular_price", operator: "eq", values: ["true"] }] },
    rules: [{ attribute: "customer_id", operator: "eq", values: [customerId] }, { attribute: "currency_code", operator: "eq", values: ["usd"] },
      { attribute: "snowforce_no_stacking", operator: "eq", values: ["true"] }],
    campaign: { name: "SnowForce newcomer", campaign_identifier: code, starts_at: now,
      ends_at: new Date(now.getTime() + policy.days * 86400000), budget: { type: "usage", limit: 1 } },
    metadata: { snowforce_newcomer: "v1", snowforce_member_id: userId, snowforce_customer_id: customerId, snowforce_newcomer_policy: policy },
  };
}
