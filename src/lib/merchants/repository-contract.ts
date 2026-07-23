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

export type MerchantRepositorySource = {
  readonly createProfile: (input: CreateMerchantProfileRow) => Promise<MerchantProfileRow>;
  readonly createBoothProgram: (input: CreateMerchantBoothProgramRow) => Promise<MerchantBoothProgramRow>;
  readonly createBoothPlan: (input: CreateMerchantBoothPlanRow) => Promise<MerchantBoothPlanRow>;
  readonly createPhysicalBooth: (input: CreateMerchantPhysicalBoothRow) => Promise<MerchantPhysicalBoothRow>;
  readonly createApplication: (input: CreateMerchantApplicationRow) => Promise<MerchantApplicationRow>;
  readonly findApplication: (applicationId: string) => Promise<MerchantApplicationRow | undefined>;
  readonly createAllocation: (input: CreateMerchantBoothAllocationRow) => Promise<MerchantBoothAllocationRow>;
  readonly createManualPayment: (input: CreateMerchantManualPaymentRow) => Promise<MerchantManualPaymentRow>;
};
