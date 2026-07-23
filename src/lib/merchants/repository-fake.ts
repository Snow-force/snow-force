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
import { MerchantRepositoryError } from "./repository-mappers";
import type {
  MerchantApplicationRow,
  MerchantBoothAllocationRow,
  MerchantBoothPlanRow,
  MerchantBoothProgramRow,
  MerchantManualPaymentRow,
  MerchantPhysicalBoothRow,
  MerchantProfileRow,
} from "./types";

const fakeTimestamp = "2026-07-22T10:00:00.000Z";

export function createMerchantRepositoryFake(): MerchantRepositorySource {
  let sequence = 0;
  const profiles: MerchantProfileRow[] = [];
  const programs: MerchantBoothProgramRow[] = [];
  const plans: MerchantBoothPlanRow[] = [];
  const booths: MerchantPhysicalBoothRow[] = [];
  const applications: MerchantApplicationRow[] = [];
  const allocations: MerchantBoothAllocationRow[] = [];
  const payments: MerchantManualPaymentRow[] = [];

  function nextId(prefix: string): string {
    sequence += 1;
    return `${prefix}-${sequence}`;
  }

  function createProfile(input: CreateMerchantProfileRow): MerchantProfileRow {
    if (profiles.some((profile) => profile.user_id === input.user_id)) {
      throw new MerchantRepositoryError("duplicate-profile");
    }
    const profile = { ...input, id: nextId("merchant-profile"), created_at: fakeTimestamp, updated_at: fakeTimestamp };
    profiles.push(profile);
    return profile;
  }

  function createBoothProgram(input: CreateMerchantBoothProgramRow): MerchantBoothProgramRow {
    if (programs.some((program) => program.event_slug === input.event_slug)) {
      throw new MerchantRepositoryError("duplicate-program");
    }
    const program = { ...input, id: nextId("booth-program"), created_at: fakeTimestamp, updated_at: fakeTimestamp };
    programs.push(program);
    return program;
  }

  function createBoothPlan(input: CreateMerchantBoothPlanRow): MerchantBoothPlanRow {
    if (!programs.some((program) => program.id === input.booth_program_id)) {
      throw new MerchantRepositoryError("not-found");
    }
    const plan = { ...input, id: nextId("booth-plan"), created_at: fakeTimestamp, updated_at: fakeTimestamp };
    plans.push(plan);
    return plan;
  }

  function createPhysicalBooth(input: CreateMerchantPhysicalBoothRow): MerchantPhysicalBoothRow {
    // The fake only enforces that the booth's program exists and that the
    // (program, booth_code) pair is unique. The plan compatibility check is
    // not enforced here so callers can bind a booth plan id that was minted
    // by an external config flow (e.g. the admin event save path, which
    // keeps the durable plan id in sync with the event aggregate plan id).
    if (!programs.some((program) => program.id === input.booth_program_id)) {
      throw new MerchantRepositoryError("incompatible-booth");
    }
    if (booths.some((booth) => booth.booth_program_id === input.booth_program_id && booth.booth_code === input.booth_code)) {
      throw new MerchantRepositoryError("duplicate-booth");
    }
    const booth = { ...input, id: nextId("physical-booth"), created_at: fakeTimestamp, updated_at: fakeTimestamp };
    booths.push(booth);
    return booth;
  }

  function createApplication(input: CreateMerchantApplicationRow): MerchantApplicationRow {
    const program = programs.find((candidate) => candidate.id === input.booth_program_id);
    if (!profiles.some((profile) => profile.id === input.merchant_profile_id) || !program) {
      throw new MerchantRepositoryError("not-found");
    }
    if (program.event_slug !== input.event_slug) {
      throw new MerchantRepositoryError("incompatible-booth");
    }
    if (applications.some((application) => (
      application.merchant_profile_id === input.merchant_profile_id && application.event_slug === input.event_slug
    ))) {
      throw new MerchantRepositoryError("duplicate-application");
    }
    const application = {
      ...input,
      id: nextId("merchant-application"),
      created_at: fakeTimestamp,
      updated_at: fakeTimestamp,
    };
    applications.push(application);
    return application;
  }

  function createAllocation(input: CreateMerchantBoothAllocationRow): MerchantBoothAllocationRow {
    const application = applications.find((candidate) => candidate.id === input.merchant_application_id);
    const booth = booths.find((candidate) => candidate.id === input.booth_id);
    if (!application || !booth) {
      throw new MerchantRepositoryError("not-found");
    }
    if (allocations.some((allocation) => allocation.merchant_application_id === input.merchant_application_id)) {
      throw new MerchantRepositoryError("duplicate-allocation");
    }
    if (allocations.some((allocation) => allocation.booth_id === input.booth_id)) {
      throw new MerchantRepositoryError("occupied-booth");
    }
    if (application.requested_plan_id !== input.booth_plan_id || booth.booth_plan_id !== input.booth_plan_id) {
      throw new MerchantRepositoryError("incompatible-booth");
    }
    const allocation = {
      ...input,
      id: nextId("booth-allocation"),
      allocated_at: fakeTimestamp,
      created_at: fakeTimestamp,
    };
    allocations.push(allocation);
    return allocation;
  }

  function createManualPayment(input: CreateMerchantManualPaymentRow): MerchantManualPaymentRow {
    if (!applications.some((application) => application.id === input.merchant_application_id)) {
      throw new MerchantRepositoryError("not-found");
    }
    if (payments.some((payment) => payment.merchant_application_id === input.merchant_application_id)) {
      throw new MerchantRepositoryError("duplicate-manual-payment");
    }
    const payment = { ...input, id: nextId("manual-payment"), created_at: fakeTimestamp };
    payments.push(payment);
    return payment;
  }

  function findProfileByUserId(userId: string): MerchantProfileRow | undefined {
    return profiles.find((profile) => profile.user_id === userId);
  }

  function updateProfile(
    userId: string,
    patch: UpdateMerchantProfileRow,
  ): MerchantProfileRow | undefined {
    const index = profiles.findIndex((profile) => profile.user_id === userId);
    if (index === -1) return undefined;
    const current = profiles[index]!;
    const updated: MerchantProfileRow = {
      ...current,
      ...patch,
      updated_at: fakeTimestamp,
    };
    profiles[index] = updated;
    return updated;
  }

  function findApplicationForMerchantByEvent(
    merchantProfileId: string,
    eventSlug: string,
  ): MerchantApplicationRow | undefined {
    return applications.find(
      (application) =>
        application.merchant_profile_id === merchantProfileId && application.event_slug === eventSlug,
    );
  }

  function updateApplicationStatus(
    applicationId: string,
    patch: UpdateMerchantApplicationStatusRow,
  ): MerchantApplicationRow | undefined {
    const index = applications.findIndex((application) => application.id === applicationId);
    if (index === -1) return undefined;
    const current = applications[index]!;
    const updated: MerchantApplicationRow = {
      ...current,
      status: patch.status,
      updated_at: patch.updated_at,
    };
    applications[index] = updated;
    return updated;
  }

  function findBoothProgramById(programId: string): MerchantBoothProgramRow | undefined {
    return programs.find((program) => program.id === programId);
  }

  function findBoothProgramByEventSlug(eventSlug: string): MerchantBoothProgramRow | undefined {
    return programs.find((program) => program.event_slug === eventSlug);
  }

  function findBoothPlanById(planId: string): MerchantBoothPlanRow | undefined {
    return plans.find((plan) => plan.id === planId);
  }

  function findPhysicalBoothById(boothId: string): MerchantPhysicalBoothRow | undefined {
    return booths.find((booth) => booth.id === boothId);
  }

  function listPhysicalBoothsForProgram(programId: string): MerchantPhysicalBoothRow[] {
    return booths.filter((booth) => booth.booth_program_id === programId);
  }

  function updateBoothProgramInstructions(
    programId: string,
    patch: UpdateMerchantBoothProgramInstructionsRow,
  ): MerchantBoothProgramRow | undefined {
    const index = programs.findIndex((program) => program.id === programId);
    if (index === -1) return undefined;
    const current = programs[index]!;
    const updated: MerchantBoothProgramRow = {
      ...current,
      payment_instructions_en: patch.payment_instructions_en,
      payment_instructions_zh: patch.payment_instructions_zh,
      updated_at: patch.updated_at,
    };
    programs[index] = updated;
    return updated;
  }

  function findAllocationForApplication(applicationId: string): MerchantBoothAllocationRow | undefined {
    return allocations.find((allocation) => allocation.merchant_application_id === applicationId);
  }

  function findManualPaymentForApplication(applicationId: string): MerchantManualPaymentRow | undefined {
    return payments.find((payment) => payment.merchant_application_id === applicationId);
  }

  return {
    async createProfile(input) {
      return createProfile(input);
    },
    async findProfileByUserId(userId) {
      return findProfileByUserId(userId);
    },
    async updateProfile(userId, patch) {
      return updateProfile(userId, patch);
    },
    async createBoothProgram(input) {
      return createBoothProgram(input);
    },
    async createBoothPlan(input) {
      return createBoothPlan(input);
    },
    async createPhysicalBooth(input) {
      return createPhysicalBooth(input);
    },
    async createApplication(input) {
      return createApplication(input);
    },
    async findApplication(applicationId) {
      return applications.find((application) => application.id === applicationId);
    },
    async findApplicationForMerchantByEvent(merchantProfileId, eventSlug) {
      return findApplicationForMerchantByEvent(merchantProfileId, eventSlug);
    },
    async updateApplicationStatus(applicationId, patch) {
      return updateApplicationStatus(applicationId, patch);
    },
    async listApplications() {
      return [...applications];
    },
    async listApplicationsForMerchant(merchantProfileId) {
      return applications.filter(
        (application) => application.merchant_profile_id === merchantProfileId,
      );
    },
    async findBoothProgramById(programId) {
      return findBoothProgramById(programId);
    },
    async findBoothProgramByEventSlug(eventSlug) {
      return findBoothProgramByEventSlug(eventSlug);
    },
    async findBoothPlanById(planId) {
      return findBoothPlanById(planId);
    },
    async findPhysicalBoothById(boothId) {
      return findPhysicalBoothById(boothId);
    },
    async listPhysicalBoothsForProgram(programId) {
      return listPhysicalBoothsForProgram(programId);
    },
    async updateBoothProgramInstructions(programId, patch) {
      return updateBoothProgramInstructions(programId, patch);
    },
    async createAllocation(input) {
      return createAllocation(input);
    },
    async findAllocationForApplication(applicationId) {
      return findAllocationForApplication(applicationId);
    },
    async listAllocations() {
      return [...allocations];
    },
    async createManualPayment(input) {
      return createManualPayment(input);
    },
    async findManualPaymentForApplication(applicationId) {
      return findManualPaymentForApplication(applicationId);
    },
    async listManualPayments() {
      return [...payments];
    },
  };
}
