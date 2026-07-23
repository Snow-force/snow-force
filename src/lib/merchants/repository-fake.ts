import type {
  CreateMerchantApplicationRow,
  CreateMerchantBoothAllocationRow,
  CreateMerchantBoothPlanRow,
  CreateMerchantBoothProgramRow,
  CreateMerchantManualPaymentRow,
  CreateMerchantPhysicalBoothRow,
  CreateMerchantProfileRow,
  MerchantRepositorySource,
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
    const plan = plans.find((candidate) => candidate.id === input.booth_plan_id);
    if (!plan || plan.booth_program_id !== input.booth_program_id) {
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
    const plan = plans.find((candidate) => candidate.id === input.requested_plan_id);
    if (!profiles.some((profile) => profile.id === input.merchant_profile_id) || !program || !plan) {
      throw new MerchantRepositoryError("not-found");
    }
    if (program.event_slug !== input.event_slug || plan.booth_program_id !== input.booth_program_id) {
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

  return {
    async createProfile(input) {
      return createProfile(input);
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
    async createAllocation(input) {
      return createAllocation(input);
    },
    async createManualPayment(input) {
      return createManualPayment(input);
    },
  };
}
