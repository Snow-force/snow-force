import { z } from "zod";

export const taxCodeId = z.string().regex(/^txcd_[A-Za-z0-9]+$/).max(80);
export const taxProductId = z.string().regex(/^prod_[A-Za-z0-9]+$/).max(120);
export const taxFingerprint = z.string().regex(/^[a-f0-9]{64}$/);
export const taxCodeSchema = z.object({
  id: taxCodeId, name: z.string().min(1).max(500), description: z.string().max(8000),
  requirements: z.object({ performance_location: z.string().max(80) }).nullable().optional(),
});
export type TaxCode = z.infer<typeof taxCodeSchema>;
export function supportedProductTaxCode(code: TaxCode) { const location = code.requirements?.performance_location; return location === undefined || location === "optional" || location === "none"; }
const staff = z.string().regex(/^user_[A-Za-z0-9]+$/);
const review = z.object({
  revision: z.number().int().positive().max(100), request_id: z.uuid(), digest: taxFingerprint,
  reviewed_at: z.iso.datetime(), reviewed_by: staff, source_fingerprint: taxFingerprint,
  code: taxCodeSchema, tax_behavior: z.literal("exclusive"), note: z.string().trim().min(5).max(1000),
}).strict();
export const taxClassificationStateSchema = z.object({ schema_version: z.literal(1), revision: z.number().int().min(1).max(100), history: z.array(review).min(1).max(100) }).strict().superRefine((value, ctx) => {
  if (value.history.length !== value.revision || value.history.some((entry, index) => entry.revision !== index + 1) || new Set(value.history.map(entry => entry.request_id)).size !== value.history.length || value.history.some((entry, index) => index > 0 && entry.reviewed_at < value.history[index - 1].reviewed_at)) ctx.addIssue({ code: "custom", message: "Tax classification history is inconsistent." });
});
export type TaxClassificationState = z.infer<typeof taxClassificationStateSchema>;
export const taxClassificationCommandSchema = z.object({
  request_id: z.uuid(), expected_revision: z.number().int().min(0).max(99),
  source_fingerprint: taxFingerprint, tax_code: taxCodeId, confirm_review: z.literal(true),
  note: z.string().trim().min(5).max(1000),
}).strict();
export type TaxClassificationCommand = z.infer<typeof taxClassificationCommandSchema>;
export const taxProductRecordSchema = z.object({
  id: taxProductId, title: z.string(), status: z.string(), variant_count: z.number().int().nonnegative(),
  source_fingerprint: taxFingerprint, state: taxClassificationStateSchema.nullable(), ready: z.boolean(),
  unsupported: z.boolean(),
}).strict();
export type TaxProductRecord = z.infer<typeof taxProductRecordSchema>;
export const taxProductPageSchema = z.object({ products: z.array(taxProductRecordSchema).max(50), count: z.number().int().nonnegative(), offset: z.number().int().nonnegative(), limit: z.literal(50) }).strict();
export const taxCodeCatalogSchema = z.object({ codes: z.array(taxCodeSchema).max(2000), fetched_at: z.iso.datetime() }).strict();
export const taxSaveResponseSchema = z.object({ product: taxProductRecordSchema, replayed: z.boolean(), applied_revision: z.number().int().positive() }).strict();
