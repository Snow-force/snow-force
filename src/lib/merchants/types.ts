export const merchantCurrencies = ["usd", "cny", "eur", "gbp", "jpy"] as const;

export type MerchantCurrency = (typeof merchantCurrencies)[number];

export const merchantApplicationStatuses = [
  "submitted",
  "under_review",
  "approved",
  "payment_pending",
  "paid",
  "rejected",
  "withdrawn",
] as const;

export type MerchantApplicationStatus = (typeof merchantApplicationStatuses)[number];

export type MerchantManualPaymentStatus = "confirmed";

export type MerchantProfile = {
  readonly id: string;
  readonly userId: string;
  readonly businessName: string;
  readonly contactName: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly category: string;
  readonly description: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type MerchantBoothProgram = {
  readonly id: string;
  readonly eventSlug: string;
  readonly enabled: boolean;
  readonly paymentInstructionsEn: string;
  readonly paymentInstructionsZh: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type MerchantBoothPlan = {
  readonly id: string;
  readonly boothProgramId: string;
  readonly nameEn: string;
  readonly nameZh: string;
  readonly descriptionEn: string;
  readonly descriptionZh: string;
  readonly priceAmount: number;
  readonly priceCurrency: MerchantCurrency;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type MerchantPhysicalBooth = {
  readonly id: string;
  readonly boothProgramId: string;
  readonly boothPlanId: string;
  readonly boothCode: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type MerchantApplication = {
  readonly id: string;
  readonly merchantProfileId: string;
  readonly eventSlug: string;
  readonly boothProgramId: string;
  readonly requestedPlanId: string;
  readonly businessName: string;
  readonly contactName: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly category: string;
  readonly description: string;
  readonly status: MerchantApplicationStatus;
  readonly quotedAmount: number;
  readonly quotedCurrency: MerchantCurrency;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type MerchantBoothAllocation = {
  readonly id: string;
  readonly merchantApplicationId: string;
  readonly boothId: string;
  readonly boothPlanId: string;
  readonly allocatedByUserId: string | null;
  readonly allocatedAt: string;
  readonly createdAt: string;
};

export type MerchantManualPayment = {
  readonly id: string;
  readonly merchantApplicationId: string;
  readonly amount: number;
  readonly currency: MerchantCurrency;
  readonly method: string;
  readonly reference: string;
  readonly note: string;
  readonly paidAt: string;
  readonly recordedByUserId: string | null;
  readonly status: MerchantManualPaymentStatus;
  readonly createdAt: string;
};

export type CreateMerchantProfile = Omit<MerchantProfile, "id" | "createdAt" | "updatedAt">;

export type CreateMerchantBoothProgram = Omit<MerchantBoothProgram, "id" | "createdAt" | "updatedAt">;

export type CreateMerchantBoothPlan = Omit<MerchantBoothPlan, "id" | "createdAt" | "updatedAt">;

export type CreateMerchantPhysicalBooth = Omit<MerchantPhysicalBooth, "id" | "createdAt" | "updatedAt">;

export type CreateMerchantApplication = Omit<MerchantApplication, "id" | "createdAt" | "updatedAt">;

export type CreateMerchantBoothAllocation = Omit<MerchantBoothAllocation, "id" | "allocatedAt" | "createdAt">;

export type CreateMerchantManualPayment = Omit<MerchantManualPayment, "id" | "createdAt">;

export type MerchantProfileRow = {
  readonly id: string;
  readonly user_id: string;
  readonly business_name: string;
  readonly contact_name: string;
  readonly contact_email: string;
  readonly contact_phone: string;
  readonly category: string;
  readonly description: string;
  readonly created_at: string;
  readonly updated_at: string;
};

export type MerchantBoothProgramRow = {
  readonly id: string;
  readonly event_slug: string;
  readonly enabled: boolean;
  readonly payment_instructions_en: string;
  readonly payment_instructions_zh: string;
  readonly created_at: string;
  readonly updated_at: string;
};

export type MerchantBoothPlanRow = {
  readonly id: string;
  readonly booth_program_id: string;
  readonly name_en: string;
  readonly name_zh: string;
  readonly description_en: string;
  readonly description_zh: string;
  readonly price_amount: number;
  readonly price_currency: string;
  readonly created_at: string;
  readonly updated_at: string;
};

export type MerchantPhysicalBoothRow = {
  readonly id: string;
  readonly booth_program_id: string;
  readonly booth_plan_id: string;
  readonly booth_code: string;
  readonly created_at: string;
  readonly updated_at: string;
};

export type MerchantApplicationRow = {
  readonly id: string;
  readonly merchant_profile_id: string;
  readonly event_slug: string;
  readonly booth_program_id: string;
  readonly requested_plan_id: string;
  readonly business_name: string;
  readonly contact_name: string;
  readonly contact_email: string;
  readonly contact_phone: string;
  readonly category: string;
  readonly description: string;
  readonly status: string;
  readonly quoted_amount: number;
  readonly quoted_currency: string;
  readonly created_at: string;
  readonly updated_at: string;
};

export type MerchantBoothAllocationRow = {
  readonly id: string;
  readonly merchant_application_id: string;
  readonly booth_id: string;
  readonly booth_plan_id: string;
  readonly allocated_by_user_id: string | null;
  readonly allocated_at: string;
  readonly created_at: string;
};

export type MerchantManualPaymentRow = {
  readonly id: string;
  readonly merchant_application_id: string;
  readonly amount: number;
  readonly currency: string;
  readonly method: string;
  readonly reference: string;
  readonly note: string;
  readonly paid_at: string;
  readonly recorded_by_user_id: string | null;
  readonly status: string;
  readonly created_at: string;
};
