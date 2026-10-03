import { z } from "zod";

export const shopPolicySections = ["shipping", "requests", "conditions", "shipping_costs", "refunds", "return_address", "consumer_rights"] as const;
export type ShopPolicySection = typeof shopPolicySections[number];

const days = z.number().int().min(1).max(365);
const paragraph = z.object({ en: z.string().trim().min(1).max(2000), zh: z.string().trim().min(1).max(2000) }).strict();
const terms = z.object({
  return_window_days: days,
  approved_dispatch_days: days,
  review_business_days: days,
  refund_business_days: days,
  processing_business_days_min: days,
  processing_business_days_max: days,
  transit_business_days_min: days,
  transit_business_days_max: days,
}).strict().refine((value) => value.processing_business_days_min <= value.processing_business_days_max && value.transit_business_days_min <= value.transit_business_days_max, { message: "Invalid policy time range." });

export const shopPublishedPolicySchema = z.object({
  schema_version: z.literal(1),
  version: z.number().int().min(1).max(1_000_000),
  effective_at: z.string().datetime(),
  content: z.object({
    seller_name: z.string().trim().min(1).max(200),
    customer_service_email: z.string().email().max(254),
    terms,
    copy: z.object({
      shipping: paragraph,
      requests: paragraph,
      conditions: paragraph,
      shipping_costs: paragraph,
      refunds: paragraph,
      return_address: paragraph,
      consumer_rights: paragraph,
    }).strict(),
  }).strict(),
}).strict();

export type ShopPublishedPolicy = z.infer<typeof shopPublishedPolicySchema>;
export const shopPublishedPolicyResponseSchema = z.object({ policy: shopPublishedPolicySchema.nullable() }).strict();
