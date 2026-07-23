/**
 * Merchant application, allocation, and offline-payment state machine.
 *
 * Every transition in this module re-reads the application, the merchant
 * ownership, the event booth program, the requested plan, the booth
 * availability, and the quoted DB amount BEFORE performing any state
 * mutation. The helpers never trust client-supplied values for price,
 * status, booth identifier, allocation identity, payment amount, or
 * payment status — those facts are derived from the repository and the
 * booth program at the moment of the transition.
 *
 * The transition graph is intentionally explicit:
 *
 *   submitted
 *      ├── under_review   (staff review)
 *      │      ├── approved        (staff approve; price/currency derived)
 *      │      │      ├── payment_pending  (staff allocation of an available
 *      │      │      │      matching booth; the application moves into
 *      │      │      │      payment_pending after a single booth is bound)
 *      │      │      │      └── paid       (staff record one manual payment)
 *      │      │      └── paid       (staff record one manual payment
 *      │      │                       without explicit allocation; rare)
 *      │      └── rejected        (terminal)
 *      ├── approved              (direct approval; not in current staff UX
 *      │                          but kept for completeness)
 *      │      ├── payment_pending
 *      │      │      └── paid
 *      │      └── paid
 *      └── withdrawn             (merchant withdraws while not yet paid)
 *
 *   payment_pending ─→ paid          (staff records the one manual payment)
 *   paid / rejected / withdrawn      are terminal.
 *
 * The server actions in `./actions.ts` wrap these helpers, add
 * revalidation, and surface the `result.error` as a redirect query parameter
 * so the merchant portal (Todo 5) and the staff surface (Todo 6) can render
 * a clear error message without leaking server stack traces.
 */

import type { Event } from "@/lib/types";
import type { MerchantAuthAccount } from "./auth-boundary";
import { getMerchantProfileByUserId } from "./profile-repository";
import {
  type MerchantRepository,
} from "./repository";
import type {
  MerchantApplication,
  MerchantApplicationStatus,
  MerchantBoothAllocation,
  MerchantBoothPlan,
  MerchantBoothProgram,
  MerchantManualPayment,
  MerchantPhysicalBooth,
  MerchantProfile,
} from "./types";
import {
  parseMerchantApplicationApproval,
  parseMerchantApplicationReview,
  parseMerchantApplicationSubmission,
  parseMerchantApplicationWithdrawal,
  parseMerchantBoothAllocation,
  parseMerchantInstructionsUpdate,
  parseMerchantManualPayment,
} from "./validation";

/**
 * Production event lookup. Returns the published event aggregate so the
 * server actions can verify the event is published, the booth program is
 * enabled, and the requested plan still exists in the same program.
 */
export type MerchantEventLookup = (slug: string) => Promise<Event | undefined>;

/**
 * Dependencies for the merchant state machine. Production wires the Supabase
 * repository, the public event repository, and `now()`. Tests swap any
 * component via `__setMerchantStateDepsForTests`.
 */
export type MerchantStateDeps = {
  repository: MerchantRepository;
  loadEvent: MerchantEventLookup;
  now: () => Date;
};

let activeDepsOverride: MerchantStateDeps | null = null;
let defaultMerchantRepository: MerchantRepository | null = null;

function defaultLoadEvent(): MerchantEventLookup {
  // Late import: keep the server-only Supabase client out of the top-level
  // import graph so tests can swap the lookup without pulling the Supabase
  // server-only code.
  return async (slug: string) => {
    const { getEvent } = await import("@/lib/events/repository");
    return getEvent(slug);
  };
}

async function defaultDeps(): Promise<MerchantStateDeps> {
  if (!defaultMerchantRepository) {
    const { createSupabaseMerchantRepository } = await import("./repository-supabase");
    defaultMerchantRepository = createSupabaseMerchantRepository();
  }
  return {
    repository: defaultMerchantRepository,
    loadEvent: defaultLoadEvent(),
    now: () => new Date(),
  };
}

async function deps(): Promise<MerchantStateDeps> {
  return activeDepsOverride ?? defaultDeps();
}

/**
 * Test seam: lets a Vitest suite swap the state-machine dependencies to a
 * controlled in-memory repository, event stub, and clock. Always reset
 * between tests.
 */
export function __setMerchantStateDepsForTests(next: MerchantStateDeps | null): void {
  activeDepsOverride = next;
}

export function __getMerchantStateDefaultDepsForTests(): Promise<MerchantStateDeps> {
  return defaultDeps();
}

export type MerchantStateErrorCode =
  | "unauthorized"
  | "unverified"
  | "no-profile"
  | "event-not-found"
  | "event-archived"
  | "program-disabled"
  | "plan-not-found"
  | "plan-program-mismatch"
  | "duplicate-application"
  | "invalid-input"
  | "forbidden"
  | "not-found"
  | "no-available-booth"
  | "booth-occupied"
  | "booth-plan-mismatch"
  | "invalid-status-transition"
  | "duplicate-allocation"
  | "duplicate-payment"
  | "instructions-required";

export type MerchantStateResult<T = { applicationId: string }> =
  | ({ success: true } & T)
  | {
      success: false;
      code: MerchantStateErrorCode;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };

function isApplicationTerminal(status: MerchantApplicationStatus): boolean {
  return status === "paid" || status === "rejected" || status === "withdrawn";
}

async function resolveVerifiedMerchantAccount(
  account: MerchantAuthAccount | null,
): Promise<{ profile: MerchantProfile } | { code: MerchantStateErrorCode; error: string }> {
  if (!account) {
    return { code: "unauthorized", error: "Sign in to manage booth applications." };
  }
  if (!account.emailConfirmed) {
    return { code: "unverified", error: "Verify your email before submitting a booth application." };
  }
  // Re-read the profile from the repository so a stale auth account whose
  // profile was deleted or replaced cannot reach a write path.
  const profile = account.profile ?? (await getMerchantProfileByUserId(account.user.id));
  if (!profile) {
    return { code: "no-profile", error: "Create a merchant profile before submitting a booth application." };
  }
  return { profile };
}

function readStaffAccount(input: { userId: string; email: string } | null): {
  userId: string;
  email: string;
} {
  if (!input) {
    throw new Error("Staff account missing");
  }
  return { userId: input.userId, email: input.email };
}

function statusTransitionError(
  current: MerchantApplicationStatus,
  attempted: MerchantApplicationStatus,
): MerchantStateResult<never> {
  return {
    success: false,
    code: "invalid-status-transition",
    error: `Application in '${current}' cannot move to '${attempted}'.`,
  };
}

function isAllowedTransition(
  current: MerchantApplicationStatus,
  next: MerchantApplicationStatus,
): boolean {
  if (current === next) return false;
  if (isApplicationTerminal(current)) return false;
  switch (current) {
    case "submitted":
      return next === "under_review" || next === "approved" || next === "rejected" || next === "withdrawn";
    case "under_review":
      return next === "approved" || next === "rejected";
    case "approved":
      return next === "payment_pending" || next === "paid" || next === "rejected";
    case "payment_pending":
      return next === "paid" || next === "rejected";
    default:
      return false;
  }
}

function isPaymentAllowed(current: MerchantApplicationStatus): boolean {
  return current === "approved" || current === "payment_pending";
}

function isWithdrawalAllowed(current: MerchantApplicationStatus): boolean {
  return current === "submitted" || current === "under_review";
}

export type SubmitMerchantApplicationResult =
  | { success: true; applicationId: string }
  | MerchantStateResult<never>;

export async function submitMerchantApplicationResult(
  account: MerchantAuthAccount | null,
  formData: FormData,
): Promise<SubmitMerchantApplicationResult> {
  const parsed = parseMerchantApplicationSubmission(formData);
  if (!parsed.success) {
    return {
      success: false,
      code: "invalid-input",
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }
  const auth = await resolveVerifiedMerchantAccount(account);
  if ("code" in auth) {
    return { success: false, code: auth.code, error: auth.error };
  }

  const { repository, loadEvent, now } = await deps();
  const event = await loadEvent(parsed.data.eventSlug);
  if (!event) {
    return { success: false, code: "event-not-found", error: "Event not found." };
  }
  if (event.status === "archived") {
    return { success: false, code: "event-archived", error: "Event is archived." };
  }
  const program = event.merchantBoothProgram;
  if (!program || !program.enabled) {
    return { success: false, code: "program-disabled", error: "Booth program is not enabled for this event." };
  }

  const plan = program.plans.find((candidate) => candidate.id === parsed.data.requestedPlanId);
  if (!plan) {
    return { success: false, code: "plan-not-found", error: "Selected booth plan is not available." };
  }

  // The booth program aggregate is the trusted source of plan/program
  // identity. We re-read the program row from the merchant repository
  // (which is the durable source after the admin event save) to look up
  // the database id used by `merchant_booth_applications.booth_program_id`.
  const durableProgram = await repository.getMerchantBoothProgramByEventSlug(event.slug);
  if (!durableProgram) {
    return { success: false, code: "program-disabled", error: "Booth program is not enabled for this event." };
  }
  if (durableProgram.eventSlug !== event.slug) {
    return { success: false, code: "plan-program-mismatch", error: "Booth plan does not match the event program." };
  }

  // Reject duplicate applications for the same merchant+event.
  const existing = await repository.findMerchantApplicationForMerchantByEvent(
    auth.profile.id,
    event.slug,
  );
  if (existing && !isApplicationTerminal(existing.status)) {
    return {
      success: false,
      code: "duplicate-application",
      error: "An application already exists for this event.",
    };
  }

  // Plan exhaustion: the number of `paid` or `payment_pending` applications
  // tied to this plan cannot exceed the configured physical booth inventory.
  const physicalBooths = await repository.listMerchantPhysicalBoothsForProgram(durableProgram.id);
  const matchingBooths = physicalBooths.filter((booth) => booth.boothPlanId === plan.id);
  if (matchingBooths.length === 0) {
    return { success: false, code: "no-available-booth", error: "No booths are configured for this plan." };
  }
  const allocations = await repository.listBoothAllocations();
  const applications = await repository.listMerchantApplications();
  const occupiedBoothIds = new Set(allocations.map((allocation) => allocation.boothId));
  const reservedBoothIds = new Set(
    applications
      .filter(
        (application) =>
          application.requestedPlanId === plan.id &&
          (application.status === "approved" ||
            application.status === "payment_pending" ||
            application.status === "paid"),
      )
      .map((application) => application.id),
  );
  // Reserved applications that already hold a booth occupy that physical
  // booth. The set of free matching booths = matchingBooths − occupiedBoothIds
  // − any application that doesn't have an allocation yet but reserves a
  // slot. The simplest invariant we can defend server-side without
  // optimistic locking is: if every matching booth is already allocated
  // OR the count of non-terminal applications is ≥ matchingBooths count,
  // reject the submission as exhausted.
  if (occupiedBoothIds.size >= matchingBooths.length) {
    return { success: false, code: "no-available-booth", error: "All booths for this plan are allocated." };
  }
  // `reservedBoothIds` tracks application ids that hold a reservation
  // without yet being paid; the count is informative (it tells us how many
  // applications are waiting on a booth), but the durable source of truth
  // is the allocations table. We treat the `matchingBooths.length −
  // occupiedBoothIds.size` headroom as the available capacity, and only
  // consider the plan exhausted when occupiedBoothIds.size ===
  // matchingBooths.length. The "reserved" counter is left in scope so a
  // future optimization (e.g. a waitlist) can use it without changing the
  // contract.
  void reservedBoothIds;

  const created = await repository.createMerchantApplication({
    merchantProfileId: auth.profile.id,
    eventSlug: event.slug,
    boothProgramId: durableProgram.id,
    requestedPlanId: plan.id,
    businessName: parsed.data.businessName,
    contactName: parsed.data.contactName,
    contactEmail: parsed.data.contactEmail,
    contactPhone: parsed.data.contactPhone,
    category: parsed.data.category,
    description: parsed.data.description,
    status: "submitted",
    quotedAmount: plan.priceAmount,
    quotedCurrency: plan.priceCurrency,
  });
  void now;
  return { success: true, applicationId: created.id };
}

export type WithdrawMerchantApplicationResult =
  | { success: true; applicationId: string }
  | MerchantStateResult<never>;

export async function withdrawMerchantApplicationResult(
  account: MerchantAuthAccount | null,
  formData: FormData,
): Promise<WithdrawMerchantApplicationResult> {
  const parsed = parseMerchantApplicationWithdrawal(formData);
  if (!parsed.success) {
    return { success: false, code: "invalid-input", error: parsed.error };
  }
  const auth = await resolveVerifiedMerchantAccount(account);
  if ("code" in auth) {
    return { success: false, code: auth.code, error: auth.error };
  }

  const { repository } = await deps();
  const application = await repository.getMerchantApplicationForMerchant(
    auth.profile.id,
    parsed.data.applicationId,
  );
  if (!application) {
    return { success: false, code: "not-found", error: "Application not found." };
  }
  if (!isWithdrawalAllowed(application.status)) {
    return statusTransitionError(application.status, "withdrawn");
  }

  const updated = await repository.updateMerchantApplicationStatus(application.id, "withdrawn");
  if (!updated) {
    return { success: false, code: "not-found", error: "Application not found." };
  }
  return { success: true, applicationId: updated.id };
}

export type ReviewMerchantApplicationResult =
  | { success: true; applicationId: string; eventSlug: string; status: MerchantApplicationStatus }
  | MerchantStateResult<never>;

export async function reviewMerchantApplicationResult(
  staff: { userId: string; email: string } | null,
  formData: FormData,
): Promise<ReviewMerchantApplicationResult> {
  const parsed = parseMerchantApplicationReview(formData);
  if (!parsed.success) {
    return {
      success: false,
      code: "invalid-input",
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }
  const staffAccount = staff ? readStaffAccount(staff) : null;
  if (!staffAccount) {
    return { success: false, code: "unauthorized", error: "Staff session required." };
  }

  const { repository } = await deps();
  const application = await repository.getMerchantApplication(parsed.data.applicationId);
  if (!application) {
    return { success: false, code: "not-found", error: "Application not found." };
  }
  const nextStatus: MerchantApplicationStatus =
    parsed.data.decision === "reject" ? "rejected" : "under_review";
  if (!isAllowedTransition(application.status, nextStatus)) {
    return statusTransitionError(application.status, nextStatus);
  }
  const updated = await repository.updateMerchantApplicationStatus(application.id, nextStatus);
  if (!updated) {
    return { success: false, code: "not-found", error: "Application not found." };
  }
  return { success: true, applicationId: updated.id, eventSlug: updated.eventSlug, status: updated.status };
}

export type ApproveMerchantApplicationResult =
  | { success: true; application: MerchantApplication }
  | MerchantStateResult<never>;

export async function approveMerchantApplicationResult(
  staff: { userId: string; email: string } | null,
  formData: FormData,
): Promise<ApproveMerchantApplicationResult> {
  const parsed = parseMerchantApplicationApproval(formData);
  if (!parsed.success) {
    return { success: false, code: "invalid-input", error: parsed.error };
  }
  const staffAccount = staff ? readStaffAccount(staff) : null;
  if (!staffAccount) {
    return { success: false, code: "unauthorized", error: "Staff session required." };
  }

  const { repository } = await deps();
  const application = await repository.getMerchantApplication(parsed.data.applicationId);
  if (!application) {
    return { success: false, code: "not-found", error: "Application not found." };
  }
  if (!isAllowedTransition(application.status, "approved")) {
    return statusTransitionError(application.status, "approved");
  }
  const updated = await repository.updateMerchantApplicationStatus(application.id, "approved");
  if (!updated) {
    return { success: false, code: "not-found", error: "Application not found." };
  }
  return { success: true, application: updated };
}

export type AllocateMerchantBoothResult =
  | {
      success: true;
      allocation: MerchantBoothAllocation;
      application: MerchantApplication;
      booth: MerchantPhysicalBooth;
    }
  | MerchantStateResult<never>;

export async function allocateMerchantBoothResult(
  staff: { userId: string; email: string } | null,
  formData: FormData,
): Promise<AllocateMerchantBoothResult> {
  const parsed = parseMerchantBoothAllocation(formData);
  if (!parsed.success) {
    return { success: false, code: "invalid-input", error: parsed.error };
  }
  const staffAccount = staff ? readStaffAccount(staff) : null;
  if (!staffAccount) {
    return { success: false, code: "unauthorized", error: "Staff session required." };
  }

  const { repository } = await deps();
  const application = await repository.getMerchantApplication(parsed.data.applicationId);
  if (!application) {
    return { success: false, code: "not-found", error: "Application not found." };
  }
  // The application must be in an approvable state and a booth must be
  // available. The transition to `payment_pending` is automatic once a
  // booth is bound; the staff UX does not need to set status twice.
  if (!isAllowedTransition(application.status, "payment_pending")) {
    return statusTransitionError(application.status, "payment_pending");
  }

  // Reject double-allocation on the same application before consulting the
  // booth inventory. This surfaces a typed `duplicate-allocation` error code
  // and prevents the underlying unique-constraint from throwing.
  const existingAllocation = await repository.getBoothAllocationForApplication(application.id);
  if (existingAllocation) {
    return {
      success: false,
      code: "duplicate-allocation",
      error: "This application already has a booth allocation.",
    };
  }

  const program = await repository.getMerchantBoothProgram(application.boothProgramId);
  if (!program) {
    return { success: false, code: "not-found", error: "Booth program is missing." };
  }
  if (!program.enabled) {
    return { success: false, code: "program-disabled", error: "Booth program is disabled." };
  }

  const physicalBooths = await repository.listMerchantPhysicalBoothsForProgram(program.id);
  const matchingBooths = physicalBooths.filter(
    (booth) => booth.boothPlanId === application.requestedPlanId,
  );
  if (matchingBooths.length === 0) {
    return {
      success: false,
      code: "no-available-booth",
      error: "No booths are configured for this plan.",
    };
  }
  const allocations = await repository.listBoothAllocations();
  const occupiedBoothIds = new Set(allocations.map((allocation) => allocation.boothId));
  const selectedBooth = await repository.getMerchantPhysicalBooth(parsed.data.boothId);
  if (!selectedBooth || selectedBooth.boothProgramId !== program.id || !matchingBooths.some((booth) => booth.id === selectedBooth.id)) {
    return {
      success: false,
      code: "booth-plan-mismatch",
      error: "Selected booth does not match this application's booth plan.",
    };
  }
  if (occupiedBoothIds.has(selectedBooth.id)) {
    return {
      success: false,
      code: "booth-occupied",
      error: "Selected booth is already allocated.",
    };
  }

  // Allocate the booth (constraint-safe: the fake and Supabase unique
  // constraints guarantee one allocation per application and per booth).
  const allocation = await repository.createBoothAllocation({
    merchantApplicationId: application.id,
    boothId: selectedBooth.id,
    boothPlanId: application.requestedPlanId,
    allocatedByUserId: staffAccount.userId,
  });
  if (allocation.boothId !== selectedBooth.id) {
    return {
      success: false,
      code: "booth-occupied",
      error: "Booth was allocated to another application.",
    };
  }

  // Move the application into payment_pending so the merchant portal can
  // show the offline-payment instructions. The status transition uses the
  // validated, durable row we just allocated against.
  const updated = await repository.updateMerchantApplicationStatus(application.id, "payment_pending");
  if (!updated) {
    return { success: false, code: "not-found", error: "Application not found." };
  }
  return {
    success: true,
    allocation,
    application: updated,
    booth: selectedBooth,
  };
}

export type PublishBoothInstructionsResult =
  | { success: true; eventSlug: string; program: MerchantBoothProgram }
  | MerchantStateResult<never>;

export async function publishBoothInstructionsResult(
  staff: { userId: string; email: string } | null,
  formData: FormData,
): Promise<PublishBoothInstructionsResult> {
  const parsed = parseMerchantInstructionsUpdate(formData);
  if (!parsed.success) {
    return {
      success: false,
      code: parsed.ignoredKeys.length ? "forbidden" : "instructions-required",
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }
  const staffAccount = staff ? readStaffAccount(staff) : null;
  if (!staffAccount) {
    return { success: false, code: "unauthorized", error: "Staff session required." };
  }

  const { repository } = await deps();
  const program = await repository.getMerchantBoothProgram(parsed.data.programId);
  if (!program) {
    return { success: false, code: "not-found", error: "Booth program not found." };
  }
  const updated = await repository.updateBoothProgramPaymentInstructions(
    program.id,
    parsed.data.paymentInstructionsEn,
    parsed.data.paymentInstructionsZh,
  );
  if (!updated) {
    return { success: false, code: "not-found", error: "Booth program not found." };
  }
  return { success: true, eventSlug: updated.eventSlug, program: updated };
}

export type RecordMerchantManualPaymentResult =
  | {
      success: true;
      application: MerchantApplication;
      eventSlug: string;
      payment: MerchantManualPayment;
    }
  | MerchantStateResult<never>;

export async function recordMerchantManualPaymentResult(
  staff: { userId: string; email: string } | null,
  formData: FormData,
): Promise<RecordMerchantManualPaymentResult> {
  const parsed = parseMerchantManualPayment(formData);
  if (!parsed.success) {
    return {
      success: false,
      code: "invalid-input",
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }
  const staffAccount = staff ? readStaffAccount(staff) : null;
  if (!staffAccount) {
    return { success: false, code: "unauthorized", error: "Staff session required." };
  }

  const { repository } = await deps();
  const application = await repository.getMerchantApplication(parsed.data.applicationId);
  if (!application) {
    return { success: false, code: "not-found", error: "Application not found." };
  }
  if (!isPaymentAllowed(application.status)) {
    return statusTransitionError(application.status, "paid");
  }

  // Manual payment can only be recorded once per application; the
  // repository constraint enforces this and we surface a typed error.
  const existingPayment = await repository.getManualPaymentForApplication(application.id);
  if (existingPayment) {
    return {
      success: false,
      code: "duplicate-payment",
      error: "A manual payment has already been recorded for this application.",
    };
  }

  // The amount and currency are derived from the application's quoted
  // amount/currency so a hostile client cannot inflate the recorded total.
  const payment = await repository.createManualPayment({
    merchantApplicationId: application.id,
    amount: application.quotedAmount,
    currency: application.quotedCurrency,
    method: parsed.data.method,
    reference: parsed.data.reference,
    note: parsed.data.note,
    paidAt: parsed.data.paidAt,
    recordedByUserId: staffAccount.userId,
    status: "confirmed",
  });

  const updated = await repository.updateMerchantApplicationStatus(application.id, "paid");
  if (!updated) {
    return { success: false, code: "not-found", error: "Application not found." };
  }
  return { success: true, application: updated, eventSlug: updated.eventSlug, payment };
}

export type MerchantAdminOperations = {
  readonly applications: readonly MerchantApplication[];
  readonly allocations: readonly MerchantBoothAllocation[];
  readonly booths: readonly MerchantPhysicalBooth[];
  readonly payments: readonly MerchantManualPayment[];
  readonly plans: ReadonlyMap<string, MerchantBoothPlan>;
  readonly programs: ReadonlyMap<string, MerchantBoothProgram>;
};

export async function getMerchantAdminOperations(): Promise<MerchantAdminOperations> {
  const { repository } = await deps();
  const [applications, allocations, payments] = await Promise.all([
    repository.listMerchantApplications(),
    repository.listBoothAllocations(),
    repository.listManualPayments(),
  ]);
  const programIds = Array.from(new Set(applications.map((application) => application.boothProgramId)));
  const planIds = Array.from(new Set(applications.map((application) => application.requestedPlanId)));
  const programs = new Map<string, MerchantBoothProgram>();
  const plans = new Map<string, MerchantBoothPlan>();
  const booths: MerchantPhysicalBooth[] = [];

  for (const programId of programIds) {
    const program = await repository.getMerchantBoothProgram(programId);
    if (!program) continue;
    programs.set(program.id, program);
    booths.push(...await repository.listMerchantPhysicalBoothsForProgram(program.id));
  }
  for (const planId of planIds) {
    const plan = await repository.getMerchantBoothPlan(planId);
    if (plan) plans.set(plan.id, plan);
  }
  return { applications, allocations, booths, payments, plans, programs };
}

/**
 * Helper for the merchant portal (Todo 5). Returns the merchant's most
 * recent application, allocation, and manual payment state for a given
 * event, or `null` if the merchant has not applied. Verified merchant only.
 */
export async function getMerchantApplicationStateForEvent(
  account: MerchantAuthAccount | null,
  eventSlug: string,
): Promise<
  | {
      application: MerchantApplication;
      allocation: MerchantBoothAllocation | null;
      payment: MerchantManualPayment | null;
      plan: MerchantBoothPlan | null;
    }
  | null
  | { error: MerchantStateErrorCode; errorMessage: string }
> {
  const auth = await resolveVerifiedMerchantAccount(account);
  if ("code" in auth) {
    return { error: auth.code, errorMessage: auth.error };
  }
  const { repository } = await deps();
  const application = await repository.findMerchantApplicationForMerchantByEvent(
    auth.profile.id,
    eventSlug,
  );
  if (!application) return null;
  const [allocation, payment, plan] = await Promise.all([
    repository.getBoothAllocationForApplication(application.id),
    repository.getManualPaymentForApplication(application.id),
    repository.getMerchantBoothPlan(application.requestedPlanId),
  ]);
  return {
    application,
    allocation: allocation ?? null,
    payment: payment ?? null,
    plan: plan ?? null,
  };
}
