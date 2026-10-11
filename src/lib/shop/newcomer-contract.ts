import { z } from "zod";
export const newcomerPolicySchema = z.object({ type: z.literal("percentage"), value: z.number().refine((value): boolean => value === 10), minimum: z.number().refine((value): boolean => value === 0), days: z.number().int().min(1).max(365), eligibility: z.enum(["new_accounts", "no_orders"]), registeredAfter: z.string().datetime().nullable() }).strict()
  .refine(p => p.type !== "percentage" || p.value <= 100).refine(p => Number(p.value.toFixed(2)) === p.value && Number(p.minimum.toFixed(2)) === p.minimum).refine(p => p.eligibility !== "new_accounts" || p.registeredAfter !== null);
export type NewcomerPolicy = z.infer<typeof newcomerPolicySchema>;
export const newcomerResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), code: z.string().regex(/^WELCOME-[A-F0-9]{32}$/), endsAt: z.string().datetime(), policy: newcomerPolicySchema, emailStatus: z.enum(["pending", "accepted", "unavailable"]).optional() }).strict(),
  z.object({ status: z.literal("disabled") }).strict(),
  z.object({ status: z.literal("ineligible") }).strict(),
  z.object({ status: z.literal("used") }).strict(),
  z.object({ status: z.literal("expired") }).strict(),
]);
export type NewcomerResult = z.infer<typeof newcomerResultSchema> | { status: "unavailable" | "signed-out" };
export function newcomerSavings(policy: NewcomerPolicy, lang: "en" | "zh") {
  return lang === "zh" ? "新人九折" : `${policy.value}% off`;
}
