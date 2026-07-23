import type {
  CreateMerchantApplication,
  CreateMerchantBoothAllocation,
  CreateMerchantBoothPlan,
  CreateMerchantBoothProgram,
  CreateMerchantManualPayment,
  CreateMerchantPhysicalBooth,
  CreateMerchantProfile,
  MerchantApplication,
  MerchantApplicationStatus,
  MerchantBoothAllocation,
  MerchantBoothPlan,
  MerchantBoothProgram,
  MerchantManualPayment,
  MerchantPhysicalBooth,
  MerchantProfile,
} from "./types";
import type {
  MerchantRepositorySource,
  UpdateMerchantApplicationStatusRow,
  UpdateMerchantBoothProgramInstructionsRow,
  UpdateMerchantProfileRow,
} from "./repository-contract";
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

export type { MerchantRepositorySource, UpdateMerchantProfileRow } from "./repository-contract";
export {
  MerchantRepositoryError,
  mapMerchantApplicationRow,
  mapMerchantBoothPlanRow,
} from "./repository-mappers";
export { createMerchantRepositoryFake } from "./repository-fake";

export function createMerchantRepository(source: MerchantRepositorySource) {
  return {
    async createMerchantProfile(input: CreateMerchantProfile): Promise<MerchantProfile> {
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
    async getMerchantProfileByUserId(userId: string): Promise<MerchantProfile | undefined> {
      const row = await source.findProfileByUserId(userId);
      return row ? mapMerchantProfileRow(row) : undefined;
    },
    async updateMerchantProfile(
      userId: string,
      patch: UpdateMerchantProfileRow,
    ): Promise<MerchantProfile | undefined> {
      const row = await source.updateProfile(userId, patch);
      return row ? mapMerchantProfileRow(row) : undefined;
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
    async getMerchantApplication(applicationId: string) {
      const application = await source.findApplication(applicationId);
      return application ? mapMerchantApplicationRow(application) : undefined;
    },
    async findMerchantApplicationForMerchantByEvent(
      merchantProfileId: string,
      eventSlug: string,
    ) {
      const application = await source.findApplicationForMerchantByEvent(merchantProfileId, eventSlug);
      return application ? mapMerchantApplicationRow(application) : undefined;
    },
    async listMerchantApplications() {
      const rows = await source.listApplications();
      return rows.map((row) => mapMerchantApplicationRow(row));
    },
    async listMerchantApplicationsForMerchant(merchantProfileId: string) {
      const rows = await source.listApplicationsForMerchant(merchantProfileId);
      return rows.map((row) => mapMerchantApplicationRow(row));
    },
    async updateMerchantApplicationStatus(
      applicationId: string,
      nextStatus: MerchantApplicationStatus,
    ) {
      const status = assertMerchantApplicationStatus(nextStatus);
      const patch: UpdateMerchantApplicationStatusRow = {
        status,
        updated_at: new Date().toISOString(),
      };
      const row = await source.updateApplicationStatus(applicationId, patch);
      return row ? mapMerchantApplicationRow(row) : undefined;
    },
    async getMerchantBoothProgram(programId: string) {
      const row = await source.findBoothProgramById(programId);
      return row ? mapMerchantBoothProgramRow(row) : undefined;
    },
    async getMerchantBoothProgramByEventSlug(eventSlug: string) {
      const row = await source.findBoothProgramByEventSlug(eventSlug);
      return row ? mapMerchantBoothProgramRow(row) : undefined;
    },
    async getMerchantBoothPlan(planId: string) {
      const row = await source.findBoothPlanById(planId);
      return row ? mapMerchantBoothPlanRow(row) : undefined;
    },
    async getMerchantPhysicalBooth(boothId: string) {
      const row = await source.findPhysicalBoothById(boothId);
      return row ? mapMerchantPhysicalBoothRow(row) : undefined;
    },
    async listMerchantPhysicalBoothsForProgram(programId: string) {
      const rows = await source.listPhysicalBoothsForProgram(programId);
      return rows.map((row) => mapMerchantPhysicalBoothRow(row));
    },
    async updateBoothProgramPaymentInstructions(
      programId: string,
      paymentInstructionsEn: string,
      paymentInstructionsZh: string,
    ) {
      const patch: UpdateMerchantBoothProgramInstructionsRow = {
        payment_instructions_en: paymentInstructionsEn,
        payment_instructions_zh: paymentInstructionsZh,
        updated_at: new Date().toISOString(),
      };
      const row = await source.updateBoothProgramInstructions(programId, patch);
      return row ? mapMerchantBoothProgramRow(row) : undefined;
    },
    async createBoothAllocation(input: CreateMerchantBoothAllocation) {
      return mapMerchantBoothAllocationRow(await source.createAllocation({
        merchant_application_id: input.merchantApplicationId,
        booth_id: input.boothId,
        booth_plan_id: input.boothPlanId,
        allocated_by_user_id: input.allocatedByUserId,
      }));
    },
    async getBoothAllocationForApplication(applicationId: string) {
      const row = await source.findAllocationForApplication(applicationId);
      return row ? mapMerchantBoothAllocationRow(row) : undefined;
    },
    async listBoothAllocations() {
      const rows = await source.listAllocations();
      return rows.map((row) => mapMerchantBoothAllocationRow(row));
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
    async getManualPaymentForApplication(applicationId: string) {
      const row = await source.findManualPaymentForApplication(applicationId);
      return row ? mapMerchantManualPaymentRow(row) : undefined;
    },
    async listManualPayments() {
      const rows = await source.listManualPayments();
      return rows.map((row) => mapMerchantManualPaymentRow(row));
    },
  };
}

export type MerchantRepository = ReturnType<typeof createMerchantRepository>;
