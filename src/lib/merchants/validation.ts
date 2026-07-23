/**
 * Merchant application, allocation, and offline-payment state machine validation.
 *
 * These parsers anchor on the merchant domain types and the Zod schema used by
 * the rest of the SnowForce admin code. They are intentionally strict:
 *
 *   - Every value is parsed and rejected if malformed; client input is never
 *     trusted to populate price, status, booth identifier, allocation
 *     identity, or payment amounts/currency/status. Those facts are derived
 *     server-side from the repository state.
 *   - The parsers return a discriminated union so callers cannot accidentally
 *     treat a failed parse as a valid input. The merchant-side parsers never
 *     accept a `quotedAmount`, `quotedCurrency`, `status`, `boothId`, or
 *     payment amount — those keys would be forged if a hostile client posts
 *     them, and the parser drops them silently rather than echoing them back.
 */

import { z } from "zod";

import { merchantCurrencies } from "./types";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const merchantCurrency = z.enum(merchantCurrencies);

const merchantApplicationStatuses = z.enum([
  "submitted",
  "under_review",
  "approved",
  "payment_pending",
  "paid",
  "rejected",
  "withdrawn",
]);

const applicationForbiddenKeys = [
  "status",
  "quotedAmount",
  "quotedCurrency",
  "merchantProfileId",
  "boothProgramId",
  "id",
  "createdAt",
  "updatedAt",
  "merchantApplicationId",
];

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function readTrimmed(formData: FormData, key: string): string {
  return readString(formData, key).trim();
}

function detectForbiddenKeys(formData: FormData, keys: readonly string[]): string[] {
  return keys.filter((key) => formData.has(key));
}

function readRawField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

const merchantApplicationSubmission = z
  .object({
    eventSlug: z.string().trim().min(1, "Event is required."),
    requestedPlanId: z.string().trim().min(1, "Booth plan is required."),
    businessName: z.string().trim().min(1, "Business name is required."),
    contactName: z.string().trim().min(1, "Contact name is required."),
    contactEmail: z
      .string()
      .trim()
      .toLowerCase()
      .regex(emailPattern, "Contact email is invalid."),
    contactPhone: z.string().trim().default(""),
    category: z.string().trim().min(1, "Business category is required."),
    description: z.string().trim().default(""),
  })
  .strict();

export type MerchantApplicationSubmission = z.infer<typeof merchantApplicationSubmission>;

export type ParseMerchantApplicationResult =
  | { success: true; data: MerchantApplicationSubmission; ignoredKeys: string[] }
  | { success: false; error: string; fieldErrors?: Record<string, string[]>; ignoredKeys: string[] };

export function parseMerchantApplicationSubmission(
  formData: FormData,
): ParseMerchantApplicationResult {
  const ignoredKeys = detectForbiddenKeys(formData, applicationForbiddenKeys);
  const raw: Record<string, string | undefined> = {
    eventSlug: readRawField(formData, "eventSlug"),
    requestedPlanId: readRawField(formData, "requestedPlanId"),
    businessName: readRawField(formData, "businessName"),
    contactName: readRawField(formData, "contactName"),
    contactEmail: readRawField(formData, "contactEmail"),
    contactPhone: readRawField(formData, "contactPhone"),
    category: readRawField(formData, "category"),
    description: readRawField(formData, "description"),
  };
  const result = merchantApplicationSubmission.safeParse(raw);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "form";
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path].push(issue.message);
    }
    return {
      success: false,
      error: "Review the application fields before submitting.",
      fieldErrors,
      ignoredKeys,
    };
  }
  return { success: true, data: result.data, ignoredKeys };
}

const merchantApplicationWithdrawal = z
  .object({
    applicationId: z.string().trim().min(1, "Application id is required."),
  })
  .strict();

export function parseMerchantApplicationWithdrawal(formData: FormData) {
  const ignoredKeys = detectForbiddenKeys(formData, [
    "status",
    "boothId",
    "boothPlanId",
    "rejectionReason",
    "amount",
    "currency",
    "method",
    "reference",
    "note",
    "paidAt",
  ]);
  const raw: Record<string, string | undefined> = {
    applicationId: readRawField(formData, "applicationId"),
  };
  const result = merchantApplicationWithdrawal.safeParse(raw);
  if (!result.success) {
    return {
      success: false as const,
      error: "Application id is required.",
      ignoredKeys,
    };
  }
  return { success: true as const, data: result.data, ignoredKeys };
}

const merchantApplicationReview = z
  .object({
    applicationId: z.string().trim().min(1, "Application id is required."),
    decision: z.enum(["under_review", "reject"]),
    rejectionReason: z.string().trim().default(""),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.decision === "reject" && value.rejectionReason.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rejectionReason"],
        message: "Rejection reason must be at least 3 characters.",
      });
    }
  });

export function parseMerchantApplicationReview(formData: FormData) {
  const ignoredKeys = detectForbiddenKeys(formData, [
    "quotedAmount",
    "quotedCurrency",
    "boothId",
    "boothPlanId",
    "amount",
    "currency",
    "method",
    "reference",
    "note",
    "paidAt",
  ]);
  const raw: Record<string, string | undefined> = {
    applicationId: readRawField(formData, "applicationId"),
    decision: readRawField(formData, "decision"),
    rejectionReason: readRawField(formData, "rejectionReason"),
  };
  const result = merchantApplicationReview.safeParse(raw);
  if (!result.success) {
    return {
      success: false as const,
      error: "Review payload is invalid.",
      fieldErrors: zodFieldErrors(result.error),
      ignoredKeys,
    };
  }
  return { success: true as const, data: result.data, ignoredKeys };
}

const merchantApplicationApproval = z
  .object({
    applicationId: z.string().trim().min(1, "Application id is required."),
  })
  .strict();

export function parseMerchantApplicationApproval(formData: FormData) {
  const ignoredKeys = detectForbiddenKeys(formData, [
    "boothId",
    "boothPlanId",
    "rejectionReason",
    "amount",
    "currency",
    "method",
    "reference",
    "note",
    "paidAt",
    "quotedAmount",
    "quotedCurrency",
    "status",
    "decision",
  ]);
  const raw: Record<string, string | undefined> = {
    applicationId: readRawField(formData, "applicationId"),
  };
  const result = merchantApplicationApproval.safeParse(raw);
  if (!result.success) {
    return {
      success: false as const,
      error: "Application id is required.",
      ignoredKeys,
    };
  }
  return { success: true as const, data: result.data, ignoredKeys };
}

const merchantBoothAllocation = z
  .object({
    applicationId: z.string().trim().min(1, "Application id is required."),
    boothId: z.string().trim().min(1, "Select an available matching booth."),
  })
  .strict();

export function parseMerchantBoothAllocation(formData: FormData) {
  const ignoredKeys = detectForbiddenKeys(formData, [
    "boothPlanId",
    "amount",
    "currency",
    "method",
    "reference",
    "note",
    "paidAt",
    "quotedAmount",
    "quotedCurrency",
    "status",
  ]);
  const raw: Record<string, string | undefined> = {
    applicationId: readRawField(formData, "applicationId"),
    boothId: readRawField(formData, "boothId"),
  };
  const result = merchantBoothAllocation.safeParse(raw);
  if (!result.success) {
    return {
      success: false as const,
      error: "Select an application and matching booth.",
      ignoredKeys,
    };
  }
  return { success: true as const, data: result.data, ignoredKeys };
}

const merchantInstructionsUpdate = z
  .object({
    programId: z.string().trim().min(1, "Program id is required."),
    paymentInstructionsEn: z.string().trim().default(""),
    paymentInstructionsZh: z.string().trim().default(""),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.paymentInstructionsEn && !value.paymentInstructionsZh) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paymentInstructionsEn"],
        message: "Provide offline payment instructions in English or Chinese.",
      });
    }
  });

export function parseMerchantInstructionsUpdate(formData: FormData) {
  const ignoredKeys = detectForbiddenKeys(formData, [
    "amount",
    "currency",
    "method",
    "reference",
    "note",
    "paidAt",
    "boothId",
    "boothPlanId",
    "applicationId",
    "quotedAmount",
    "quotedCurrency",
    "status",
  ]);
  const raw: Record<string, string | undefined> = {
    programId: readRawField(formData, "programId"),
    paymentInstructionsEn: readRawField(formData, "paymentInstructionsEn"),
    paymentInstructionsZh: readRawField(formData, "paymentInstructionsZh"),
  };
  const result = merchantInstructionsUpdate.safeParse(raw);
  if (!result.success) {
    return {
      success: false as const,
      error: "Provide offline payment instructions in English or Chinese.",
      fieldErrors: zodFieldErrors(result.error),
      ignoredKeys,
    };
  }
  return { success: true as const, data: result.data, ignoredKeys };
}

const merchantManualPayment = z
  .object({
    applicationId: z.string().trim().min(1, "Application id is required."),
    method: z.string().trim().min(1, "Payment method is required."),
    reference: z.string().trim().min(1, "Payment reference is required."),
    note: z.string().trim().default(""),
    paidAt: z
      .string()
      .trim()
      .min(1, "Paid-at date is required.")
      .refine((value) => !Number.isNaN(new Date(value).getTime()), "Paid-at is invalid."),
  })
  .strict();

export type MerchantManualPaymentInput = z.infer<typeof merchantManualPayment>;

export function parseMerchantManualPayment(formData: FormData) {
  const ignoredKeys = detectForbiddenKeys(formData, [
    "amount",
    "currency",
    "status",
    "boothId",
    "boothPlanId",
    "quotedAmount",
    "quotedCurrency",
  ]);
  const raw: Record<string, string | undefined> = {
    applicationId: readRawField(formData, "applicationId"),
    method: readRawField(formData, "method"),
    reference: readRawField(formData, "reference"),
    note: readRawField(formData, "note"),
    paidAt: readRawField(formData, "paidAt"),
  };
  const result = merchantManualPayment.safeParse(raw);
  if (!result.success) {
    return {
      success: false as const,
      error: "Manual payment payload is invalid.",
      fieldErrors: zodFieldErrors(result.error),
      ignoredKeys,
    };
  }
  return { success: true as const, data: result.data, ignoredKeys };
}

function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "form";
    if (!fieldErrors[path]) fieldErrors[path] = [];
    fieldErrors[path].push(issue.message);
  }
  return fieldErrors;
}

export const __merchantValidationInternals = {
  merchantCurrency,
  merchantApplicationStatuses,
  applicationForbiddenKeys,
};
