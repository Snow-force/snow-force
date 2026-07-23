import type {
  MerchantApplicationRow,
  MerchantBoothAllocationRow,
  MerchantBoothPlanRow,
  MerchantBoothProgramRow,
  MerchantManualPaymentRow,
  MerchantPhysicalBoothRow,
  MerchantProfileRow,
} from "./types";

export type CreateMerchantProfileRow = Omit<MerchantProfileRow, "id" | "created_at" | "updated_at">;

export type CreateMerchantBoothProgramRow = Omit<
  MerchantBoothProgramRow,
  "id" | "created_at" | "updated_at"
>;

export type CreateMerchantBoothPlanRow = Omit<MerchantBoothPlanRow, "id" | "created_at" | "updated_at">;

export type CreateMerchantPhysicalBoothRow = Omit<
  MerchantPhysicalBoothRow,
  "id" | "created_at" | "updated_at"
>;

export type CreateMerchantApplicationRow = Omit<
  MerchantApplicationRow,
  "id" | "created_at" | "updated_at"
>;

export type CreateMerchantBoothAllocationRow = Omit<
  MerchantBoothAllocationRow,
  "id" | "allocated_at" | "created_at"
>;

export type CreateMerchantManualPaymentRow = Omit<MerchantManualPaymentRow, "id" | "created_at">;

export type UpdateMerchantProfileRow = Partial<
  Omit<MerchantProfileRow, "id" | "user_id" | "created_at" | "updated_at">
>;

export type UpdateMerchantApplicationStatusRow = {
  status: MerchantApplicationRow["status"];
  updated_at: string;
};

export type UpdateMerchantBoothProgramInstructionsRow = {
  payment_instructions_en: string;
  payment_instructions_zh: string;
  updated_at: string;
};

export type MerchantRepositorySource = {
  readonly createProfile: (input: CreateMerchantProfileRow) => Promise<MerchantProfileRow>;
  readonly findProfileByUserId: (userId: string) => Promise<MerchantProfileRow | undefined>;
  readonly updateProfile: (
    userId: string,
    patch: UpdateMerchantProfileRow,
  ) => Promise<MerchantProfileRow | undefined>;
  readonly createBoothProgram: (input: CreateMerchantBoothProgramRow) => Promise<MerchantBoothProgramRow>;
  readonly createBoothPlan: (input: CreateMerchantBoothPlanRow) => Promise<MerchantBoothPlanRow>;
  readonly createPhysicalBooth: (input: CreateMerchantPhysicalBoothRow) => Promise<MerchantPhysicalBoothRow>;
  readonly createApplication: (input: CreateMerchantApplicationRow) => Promise<MerchantApplicationRow>;
  readonly findApplication: (applicationId: string) => Promise<MerchantApplicationRow | undefined>;
  readonly findApplicationForMerchantByEvent: (
    merchantProfileId: string,
    eventSlug: string,
  ) => Promise<MerchantApplicationRow | undefined>;
  readonly updateApplicationStatus: (
    applicationId: string,
    patch: UpdateMerchantApplicationStatusRow,
  ) => Promise<MerchantApplicationRow | undefined>;
  readonly listApplications: () => Promise<MerchantApplicationRow[]>;
  readonly listApplicationsForMerchant: (
    merchantProfileId: string,
  ) => Promise<MerchantApplicationRow[]>;
  readonly findBoothProgramById: (programId: string) => Promise<MerchantBoothProgramRow | undefined>;
  readonly findBoothProgramByEventSlug: (eventSlug: string) => Promise<MerchantBoothProgramRow | undefined>;
  readonly findBoothPlanById: (planId: string) => Promise<MerchantBoothPlanRow | undefined>;
  readonly findPhysicalBoothById: (boothId: string) => Promise<MerchantPhysicalBoothRow | undefined>;
  readonly listPhysicalBoothsForProgram: (
    programId: string,
  ) => Promise<MerchantPhysicalBoothRow[]>;
  readonly updateBoothProgramInstructions: (
    programId: string,
    patch: UpdateMerchantBoothProgramInstructionsRow,
  ) => Promise<MerchantBoothProgramRow | undefined>;
  readonly createAllocation: (input: CreateMerchantBoothAllocationRow) => Promise<MerchantBoothAllocationRow>;
  readonly findAllocationForApplication: (
    applicationId: string,
  ) => Promise<MerchantBoothAllocationRow | undefined>;
  readonly listAllocations: () => Promise<MerchantBoothAllocationRow[]>;
  readonly createManualPayment: (input: CreateMerchantManualPaymentRow) => Promise<MerchantManualPaymentRow>;
  readonly findManualPaymentForApplication: (
    applicationId: string,
  ) => Promise<MerchantManualPaymentRow | undefined>;
  readonly listManualPayments: () => Promise<MerchantManualPaymentRow[]>;
};
