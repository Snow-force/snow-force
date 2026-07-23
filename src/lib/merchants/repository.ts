import type {
  CreateMerchantApplication,
  CreateMerchantBoothAllocation,
  CreateMerchantBoothPlan,
  CreateMerchantBoothProgram,
  CreateMerchantManualPayment,
  CreateMerchantPhysicalBooth,
  CreateMerchantProfile,
} from "./types";
import type { MerchantRepositorySource } from "./repository-contract";
import {
  assertMerchantApplicationStatus,
  assertMerchantManualPaymentStatus,
  assertPositiveMerchantMoney,
  mapMerchantApplicationRow,
  mapMerchantBoothAllocationRow,
  mapMerchantBoothPlanRow,
  mapMerchantBoothProgramRow,
  mapMerchantManualPaymentRow,
  mapMerchantPhysicalBoothRow,
  mapMerchantProfileRow,
} from "./repository-mappers";

export type { MerchantRepositorySource } from "./repository-contract";
export {
  MerchantRepositoryError,
  mapMerchantApplicationRow,
  mapMerchantBoothPlanRow,
} from "./repository-mappers";
export { createMerchantRepositoryFake } from "./repository-fake";

export function createMerchantRepository(source: MerchantRepositorySource) {
  return {
    async createMerchantProfile(input: CreateMerchantProfile) {
      return mapMerchantProfileRow(await source.createProfile({
        user_id: input.userId,
        business_name: input.businessName,
        contact_name: input.contactName,
        contact_email: input.contactEmail,
        contact_phone: input.contactPhone,
        category: input.category,
        description: input.description,
      }));
    },
    async createBoothProgram(input: CreateMerchantBoothProgram) {
      return mapMerchantBoothProgramRow(await source.createBoothProgram({
        event_slug: input.eventSlug,
        enabled: input.enabled,
        payment_instructions_en: input.paymentInstructionsEn,
        payment_instructions_zh: input.paymentInstructionsZh,
      }));
    },
    async createBoothPlan(input: CreateMerchantBoothPlan) {
      assertPositiveMerchantMoney(input.priceAmount);
      return mapMerchantBoothPlanRow(await source.createBoothPlan({
        booth_program_id: input.boothProgramId,
        name_en: input.nameEn,
        name_zh: input.nameZh,
        description_en: input.descriptionEn,
        description_zh: input.descriptionZh,
        price_amount: input.priceAmount,
        price_currency: input.priceCurrency,
      }));
    },
    async createPhysicalBooth(input: CreateMerchantPhysicalBooth) {
      return mapMerchantPhysicalBoothRow(await source.createPhysicalBooth({
        booth_program_id: input.boothProgramId,
        booth_plan_id: input.boothPlanId,
        booth_code: input.boothCode,
      }));
    },
    async createMerchantApplication(input: CreateMerchantApplication) {
      assertPositiveMerchantMoney(input.quotedAmount);
      const status = assertMerchantApplicationStatus(input.status);
      return mapMerchantApplicationRow(await source.createApplication({
        merchant_profile_id: input.merchantProfileId,
        event_slug: input.eventSlug,
        booth_program_id: input.boothProgramId,
        requested_plan_id: input.requestedPlanId,
        business_name: input.businessName,
        contact_name: input.contactName,
        contact_email: input.contactEmail,
        contact_phone: input.contactPhone,
        category: input.category,
        description: input.description,
        status,
        quoted_amount: input.quotedAmount,
        quoted_currency: input.quotedCurrency,
      }));
    },
    async getMerchantApplicationForMerchant(merchantProfileId: string, applicationId: string) {
      const application = await source.findApplication(applicationId);
      if (!application || application.merchant_profile_id !== merchantProfileId) {
        return undefined;
      }
      return mapMerchantApplicationRow(application);
    },
    async createBoothAllocation(input: CreateMerchantBoothAllocation) {
      return mapMerchantBoothAllocationRow(await source.createAllocation({
        merchant_application_id: input.merchantApplicationId,
        booth_id: input.boothId,
        booth_plan_id: input.boothPlanId,
        allocated_by_user_id: input.allocatedByUserId,
      }));
    },
    async createManualPayment(input: CreateMerchantManualPayment) {
      assertPositiveMerchantMoney(input.amount);
      const status = assertMerchantManualPaymentStatus(input.status);
      return mapMerchantManualPaymentRow(await source.createManualPayment({
        merchant_application_id: input.merchantApplicationId,
        amount: input.amount,
        currency: input.currency,
        method: input.method,
        reference: input.reference,
        note: input.note,
        paid_at: input.paidAt,
        recorded_by_user_id: input.recordedByUserId,
        status,
      }));
    },
  };
}
