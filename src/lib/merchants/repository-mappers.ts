import type {
  MerchantApplication,
  MerchantApplicationRow,
  MerchantApplicationStatus,
  MerchantBoothAllocation,
  MerchantBoothAllocationRow,
  MerchantBoothPlan,
  MerchantBoothPlanRow,
  MerchantBoothProgram,
  MerchantBoothProgramRow,
  MerchantCurrency,
  MerchantManualPayment,
  MerchantManualPaymentRow,
  MerchantManualPaymentStatus,
  MerchantPhysicalBooth,
  MerchantPhysicalBoothRow,
  MerchantProfile,
  MerchantProfileRow,
} from "./types";

export const merchantRepositoryErrorCodes = [
  "duplicate-profile",
  "duplicate-program",
  "duplicate-booth",
  "duplicate-application",
  "duplicate-allocation",
  "occupied-booth",
  "duplicate-manual-payment",
  "invalid-currency",
  "invalid-money",
  "invalid-status",
  "incompatible-booth",
  "not-found",
] as const;

export type MerchantRepositoryErrorCode = (typeof merchantRepositoryErrorCodes)[number];

export class MerchantRepositoryError extends Error {
  readonly code: MerchantRepositoryErrorCode;

  constructor(code: MerchantRepositoryErrorCode) {
    super(code);
    this.code = code;
    this.name = "MerchantRepositoryError";
  }
}

export function assertPositiveMerchantMoney(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new MerchantRepositoryError("invalid-money");
  }
}

function mapMerchantCurrency(value: string): MerchantCurrency {
  switch (value) {
    case "usd":
    case "cny":
    case "eur":
    case "gbp":
    case "jpy":
      return value;
    default:
      throw new MerchantRepositoryError("invalid-currency");
  }
}

export function assertMerchantApplicationStatus(value: string): MerchantApplicationStatus {
  switch (value) {
    case "submitted":
    case "under_review":
    case "approved":
    case "payment_pending":
    case "paid":
    case "rejected":
    case "withdrawn":
      return value;
    default:
      throw new MerchantRepositoryError("invalid-status");
  }
}

export function assertMerchantManualPaymentStatus(value: string): MerchantManualPaymentStatus {
  if (value !== "confirmed") {
    throw new MerchantRepositoryError("invalid-status");
  }
  return value;
}

export function mapMerchantProfileRow(row: MerchantProfileRow): MerchantProfile {
  return {
    id: row.id,
    userId: row.user_id,
    businessName: row.business_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    category: row.category,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMerchantBoothProgramRow(row: MerchantBoothProgramRow): MerchantBoothProgram {
  return {
    id: row.id,
    eventSlug: row.event_slug,
    enabled: row.enabled,
    paymentInstructionsEn: row.payment_instructions_en,
    paymentInstructionsZh: row.payment_instructions_zh,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMerchantBoothPlanRow(row: MerchantBoothPlanRow): MerchantBoothPlan {
  assertPositiveMerchantMoney(row.price_amount);
  return {
    id: row.id,
    boothProgramId: row.booth_program_id,
    nameEn: row.name_en,
    nameZh: row.name_zh,
    descriptionEn: row.description_en,
    descriptionZh: row.description_zh,
    priceAmount: row.price_amount,
    priceCurrency: mapMerchantCurrency(row.price_currency),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMerchantPhysicalBoothRow(row: MerchantPhysicalBoothRow): MerchantPhysicalBooth {
  return {
    id: row.id,
    boothProgramId: row.booth_program_id,
    boothPlanId: row.booth_plan_id,
    boothCode: row.booth_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMerchantApplicationRow(row: MerchantApplicationRow): MerchantApplication {
  assertPositiveMerchantMoney(row.quoted_amount);
  return {
    id: row.id,
    merchantProfileId: row.merchant_profile_id,
    eventSlug: row.event_slug,
    boothProgramId: row.booth_program_id,
    requestedPlanId: row.requested_plan_id,
    businessName: row.business_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    category: row.category,
    description: row.description,
    status: assertMerchantApplicationStatus(row.status),
    quotedAmount: row.quoted_amount,
    quotedCurrency: mapMerchantCurrency(row.quoted_currency),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMerchantBoothAllocationRow(row: MerchantBoothAllocationRow): MerchantBoothAllocation {
  return {
    id: row.id,
    merchantApplicationId: row.merchant_application_id,
    boothId: row.booth_id,
    boothPlanId: row.booth_plan_id,
    allocatedByUserId: row.allocated_by_user_id,
    allocatedAt: row.allocated_at,
    createdAt: row.created_at,
  };
}

export function mapMerchantManualPaymentRow(row: MerchantManualPaymentRow): MerchantManualPayment {
  assertPositiveMerchantMoney(row.amount);
  return {
    id: row.id,
    merchantApplicationId: row.merchant_application_id,
    amount: row.amount,
    currency: mapMerchantCurrency(row.currency),
    method: row.method,
    reference: row.reference,
    note: row.note,
    paidAt: row.paid_at,
    recordedByUserId: row.recorded_by_user_id,
    status: assertMerchantManualPaymentStatus(row.status),
    createdAt: row.created_at,
  };
}
