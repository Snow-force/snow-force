import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import type {
  CreateMerchantApplicationRow,
  CreateMerchantBoothAllocationRow,
  CreateMerchantBoothPlanRow,
  CreateMerchantBoothProgramRow,
  CreateMerchantManualPaymentRow,
  CreateMerchantPhysicalBoothRow,
  CreateMerchantProfileRow,
  MerchantRepositorySource,
  UpdateMerchantApplicationStatusRow,
  UpdateMerchantBoothProgramInstructionsRow,
  UpdateMerchantProfileRow,
} from "./repository-contract";
import { createMerchantRepository, type MerchantRepository } from "./repository";
import type {
  MerchantApplicationRow,
  MerchantBoothAllocationRow,
  MerchantBoothPlanRow,
  MerchantBoothProgramRow,
  MerchantManualPaymentRow,
  MerchantPhysicalBoothRow,
  MerchantProfileRow,
} from "./types";

const merchantColumns = {
  profile: "id,user_id,business_name,contact_name,contact_email,contact_phone,category,description,created_at,updated_at",
  program: "id,event_slug,enabled,payment_instructions_en,payment_instructions_zh,created_at,updated_at",
  plan: "id,booth_program_id,name_en,name_zh,description_en,description_zh,price_amount,price_currency,created_at,updated_at",
  booth: "id,booth_program_id,booth_plan_id,booth_code,created_at,updated_at",
  application: "id,merchant_profile_id,event_slug,booth_program_id,requested_plan_id,business_name,contact_name,contact_email,contact_phone,category,description,status,quoted_amount,quoted_currency,created_at,updated_at",
  allocation: "id,merchant_application_id,booth_id,booth_plan_id,allocated_by_user_id,allocated_at,created_at",
  payment: "id,merchant_application_id,amount,currency,method,reference,note,paid_at,recorded_by_user_id,status,created_at",
} as const;

type SupabaseError = { readonly message: string };

function throwSupabaseError(error: SupabaseError | null): void {
  if (error) throw new Error(error.message);
}

function requiredRow<TRow>(row: TRow | null): TRow {
  if (!row) throw new Error("Supabase mutation returned no row.");
  return row;
}

export function createSupabaseMerchantRepositorySource(): MerchantRepositorySource {
  return {
    async createProfile(input: CreateMerchantProfileRow): Promise<MerchantProfileRow> {
      const { data, error } = await createAdminClient().from("merchant_profiles").insert(input).select(merchantColumns.profile).single<MerchantProfileRow>();
      throwSupabaseError(error);
      return requiredRow(data);
    },
    async findProfileByUserId(userId: string): Promise<MerchantProfileRow | undefined> {
      const { data, error } = await createAdminClient().from("merchant_profiles").select(merchantColumns.profile).eq("user_id", userId).maybeSingle<MerchantProfileRow>();
      throwSupabaseError(error);
      return data ?? undefined;
    },
    async updateProfile(userId: string, patch: UpdateMerchantProfileRow): Promise<MerchantProfileRow | undefined> {
      const { data, error } = await createAdminClient().from("merchant_profiles").update(patch).eq("user_id", userId).select(merchantColumns.profile).maybeSingle<MerchantProfileRow>();
      throwSupabaseError(error);
      return data ?? undefined;
    },
    async createBoothProgram(input: CreateMerchantBoothProgramRow): Promise<MerchantBoothProgramRow> {
      const { data, error } = await createAdminClient().from("merchant_booth_programs").insert(input).select(merchantColumns.program).single<MerchantBoothProgramRow>();
      throwSupabaseError(error);
      return requiredRow(data);
    },
    async createBoothPlan(input: CreateMerchantBoothPlanRow): Promise<MerchantBoothPlanRow> {
      const { data, error } = await createAdminClient().from("merchant_booth_plans").insert(input).select(merchantColumns.plan).single<MerchantBoothPlanRow>();
      throwSupabaseError(error);
      return requiredRow(data);
    },
    async createPhysicalBooth(input: CreateMerchantPhysicalBoothRow): Promise<MerchantPhysicalBoothRow> {
      const { data, error } = await createAdminClient().from("merchant_physical_booths").insert(input).select(merchantColumns.booth).single<MerchantPhysicalBoothRow>();
      throwSupabaseError(error);
      return requiredRow(data);
    },
    async createApplication(input: CreateMerchantApplicationRow): Promise<MerchantApplicationRow> {
      const { data, error } = await createAdminClient().from("merchant_booth_applications").insert(input).select(merchantColumns.application).single<MerchantApplicationRow>();
      throwSupabaseError(error);
      return requiredRow(data);
    },
    async findApplication(applicationId: string): Promise<MerchantApplicationRow | undefined> {
      const { data, error } = await createAdminClient().from("merchant_booth_applications").select(merchantColumns.application).eq("id", applicationId).maybeSingle<MerchantApplicationRow>();
      throwSupabaseError(error);
      return data ?? undefined;
    },
    async findApplicationForMerchantByEvent(merchantProfileId: string, eventSlug: string): Promise<MerchantApplicationRow | undefined> {
      const { data, error } = await createAdminClient().from("merchant_booth_applications").select(merchantColumns.application).eq("merchant_profile_id", merchantProfileId).eq("event_slug", eventSlug).maybeSingle<MerchantApplicationRow>();
      throwSupabaseError(error);
      return data ?? undefined;
    },
    async updateApplicationStatus(applicationId: string, patch: UpdateMerchantApplicationStatusRow): Promise<MerchantApplicationRow | undefined> {
      const { data, error } = await createAdminClient().from("merchant_booth_applications").update(patch).eq("id", applicationId).select(merchantColumns.application).maybeSingle<MerchantApplicationRow>();
      throwSupabaseError(error);
      return data ?? undefined;
    },
    async listApplications(): Promise<MerchantApplicationRow[]> {
      const { data, error } = await createAdminClient().from("merchant_booth_applications").select(merchantColumns.application);
      throwSupabaseError(error);
      return data ?? [];
    },
    async listApplicationsForMerchant(merchantProfileId: string): Promise<MerchantApplicationRow[]> {
      const { data, error } = await createAdminClient().from("merchant_booth_applications").select(merchantColumns.application).eq("merchant_profile_id", merchantProfileId);
      throwSupabaseError(error);
      return data ?? [];
    },
    async findBoothProgramById(programId: string): Promise<MerchantBoothProgramRow | undefined> {
      const { data, error } = await createAdminClient().from("merchant_booth_programs").select(merchantColumns.program).eq("id", programId).maybeSingle<MerchantBoothProgramRow>();
      throwSupabaseError(error);
      return data ?? undefined;
    },
    async findBoothProgramByEventSlug(eventSlug: string): Promise<MerchantBoothProgramRow | undefined> {
      const { data, error } = await createAdminClient().from("merchant_booth_programs").select(merchantColumns.program).eq("event_slug", eventSlug).maybeSingle<MerchantBoothProgramRow>();
      throwSupabaseError(error);
      return data ?? undefined;
    },
    async findBoothPlanById(planId: string): Promise<MerchantBoothPlanRow | undefined> {
      const { data, error } = await createAdminClient().from("merchant_booth_plans").select(merchantColumns.plan).eq("id", planId).maybeSingle<MerchantBoothPlanRow>();
      throwSupabaseError(error);
      return data ?? undefined;
    },
    async findPhysicalBoothById(boothId: string): Promise<MerchantPhysicalBoothRow | undefined> {
      const { data, error } = await createAdminClient().from("merchant_physical_booths").select(merchantColumns.booth).eq("id", boothId).maybeSingle<MerchantPhysicalBoothRow>();
      throwSupabaseError(error);
      return data ?? undefined;
    },
    async listPhysicalBoothsForProgram(programId: string): Promise<MerchantPhysicalBoothRow[]> {
      const { data, error } = await createAdminClient().from("merchant_physical_booths").select(merchantColumns.booth).eq("booth_program_id", programId);
      throwSupabaseError(error);
      return data ?? [];
    },
    async updateBoothProgramInstructions(programId: string, patch: UpdateMerchantBoothProgramInstructionsRow): Promise<MerchantBoothProgramRow | undefined> {
      const { data, error } = await createAdminClient().from("merchant_booth_programs").update(patch).eq("id", programId).select(merchantColumns.program).maybeSingle<MerchantBoothProgramRow>();
      throwSupabaseError(error);
      return data ?? undefined;
    },
    async createAllocation(input: CreateMerchantBoothAllocationRow): Promise<MerchantBoothAllocationRow> {
      const { data, error } = await createAdminClient().from("merchant_booth_allocations").insert(input).select(merchantColumns.allocation).single<MerchantBoothAllocationRow>();
      throwSupabaseError(error);
      return requiredRow(data);
    },
    async findAllocationForApplication(applicationId: string): Promise<MerchantBoothAllocationRow | undefined> {
      const { data, error } = await createAdminClient().from("merchant_booth_allocations").select(merchantColumns.allocation).eq("merchant_application_id", applicationId).maybeSingle<MerchantBoothAllocationRow>();
      throwSupabaseError(error);
      return data ?? undefined;
    },
    async listAllocations(): Promise<MerchantBoothAllocationRow[]> {
      const { data, error } = await createAdminClient().from("merchant_booth_allocations").select(merchantColumns.allocation);
      throwSupabaseError(error);
      return data ?? [];
    },
    async createManualPayment(input: CreateMerchantManualPaymentRow): Promise<MerchantManualPaymentRow> {
      const { data, error } = await createAdminClient().from("merchant_manual_payments").insert(input).select(merchantColumns.payment).single<MerchantManualPaymentRow>();
      throwSupabaseError(error);
      return requiredRow(data);
    },
    async findManualPaymentForApplication(applicationId: string): Promise<MerchantManualPaymentRow | undefined> {
      const { data, error } = await createAdminClient().from("merchant_manual_payments").select(merchantColumns.payment).eq("merchant_application_id", applicationId).maybeSingle<MerchantManualPaymentRow>();
      throwSupabaseError(error);
      return data ?? undefined;
    },
    async listManualPayments(): Promise<MerchantManualPaymentRow[]> {
      const { data, error } = await createAdminClient().from("merchant_manual_payments").select(merchantColumns.payment);
      throwSupabaseError(error);
      return data ?? [];
    },
  };
}

export function createSupabaseMerchantRepository(): MerchantRepository {
  return createMerchantRepository(createSupabaseMerchantRepositorySource());
}
