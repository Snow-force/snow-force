import type { Event } from "@/lib/types";
import type { MerchantAdminOperations } from "./application-state";
import type {
  MerchantApplication,
  MerchantApplicationStatus,
  MerchantBoothAllocation,
  MerchantBoothPlan,
  MerchantBoothProgram,
  MerchantManualPayment,
  MerchantPhysicalBooth,
} from "./types";

export type AdminMerchantEventOption = {
  readonly slug: string;
  readonly label: string;
  readonly count: number;
};

export type AdminMerchantApplicationItem = {
  readonly application: MerchantApplication;
  readonly allocation: MerchantBoothAllocation | null;
  readonly assignedBooth: MerchantPhysicalBooth | null;
  readonly availableBooths: readonly MerchantPhysicalBooth[];
  readonly payment: MerchantManualPayment | null;
  readonly plan: MerchantBoothPlan | null;
  readonly program: MerchantBoothProgram | null;
};

export type AdminMerchantView = {
  readonly eventOptions: readonly AdminMerchantEventOption[];
  readonly selectedEventSlug: string;
  readonly selectedStatus: MerchantApplicationStatus | "";
  readonly selectedItems: readonly AdminMerchantApplicationItem[];
  readonly instructionPrograms: readonly MerchantBoothProgram[];
};


export type AdminMerchantOperationRecord = {
  readonly application: MerchantApplication;
  readonly plan: MerchantBoothPlan | null;
  readonly allocation: MerchantBoothAllocation | null;
  readonly booth: MerchantPhysicalBooth | null;
  readonly payment: MerchantManualPayment | null;
  readonly availableBooths: readonly MerchantPhysicalBooth[];
};

export const adminMerchantApplicationStatuses = [
  "submitted",
  "under_review",
  "approved",
  "payment_pending",
  "paid",
  "rejected",
  "withdrawn",
] as const;

export type AdminMerchantOperationsView = {
  readonly records: readonly AdminMerchantOperationRecord[];
  readonly programs: readonly MerchantBoothProgram[];
  readonly eventOptions: readonly AdminMerchantEventOption[];
  readonly selectedEventSlug: string;
  readonly selectedStatus: MerchantApplicationStatus | "all";
};

function isMerchantApplicationStatus(value: string | undefined): value is MerchantApplicationStatus {
  return value === "submitted" || value === "under_review" || value === "approved" || value === "payment_pending" || value === "paid" || value === "rejected" || value === "withdrawn";
}

function eventLabel(event: Event | undefined, slug: string): string {
  return event?.title.en || event?.title.zh || slug;
}

export function buildAdminMerchantView({
  operations,
  eventsBySlug,
  requestedEventSlug,
  requestedStatus,
}: {
  readonly operations: MerchantAdminOperations;
  readonly eventsBySlug: ReadonlyMap<string, Event>;
  readonly requestedEventSlug?: string;
  readonly requestedStatus?: string;
}): AdminMerchantView {
  const eventCounts = new Map<string, number>();
  const allocationByApplication = new Map(operations.allocations.map((allocation) => [allocation.merchantApplicationId, allocation]));
  const paymentByApplication = new Map(operations.payments.map((payment) => [payment.merchantApplicationId, payment]));
  const occupiedBoothIds = new Set(operations.allocations.map((allocation) => allocation.boothId));
  for (const application of operations.applications) {
    eventCounts.set(application.eventSlug, (eventCounts.get(application.eventSlug) ?? 0) + 1);
  }
  const selectedEventSlug = requestedEventSlug && eventCounts.has(requestedEventSlug)
    ? requestedEventSlug
    : operations.applications[0]?.eventSlug ?? "";
  const selectedStatus = isMerchantApplicationStatus(requestedStatus) ? requestedStatus : "";
  const selectedItems = operations.applications
    .filter((application) => application.eventSlug === selectedEventSlug)
    .filter((application) => !selectedStatus || application.status === selectedStatus)
    .map((application) => {
      const allocation = allocationByApplication.get(application.id) ?? null;
      const matchingBooths = operations.booths.filter((booth) => booth.boothProgramId === application.boothProgramId && booth.boothPlanId === application.requestedPlanId);
      return {
        application,
        allocation,
        assignedBooth: allocation ? operations.booths.find((booth) => booth.id === allocation.boothId) ?? null : null,
        availableBooths: matchingBooths.filter((booth) => !occupiedBoothIds.has(booth.id)),
        payment: paymentByApplication.get(application.id) ?? null,
        plan: operations.plans.get(application.requestedPlanId) ?? null,
        program: operations.programs.get(application.boothProgramId) ?? null,
      };
    });
  const instructionPrograms = Array.from(new Map(selectedItems
    .map((item) => item.program)
    .filter((program): program is MerchantBoothProgram => program !== null)
    .map((program) => [program.id, program])).values());
  return {
    eventOptions: Array.from(eventCounts, ([slug, count]) => ({ slug, label: eventLabel(eventsBySlug.get(slug), slug), count })),
    selectedEventSlug,
    selectedStatus,
    selectedItems,
    instructionPrograms,
  };
}

export function buildAdminMerchantOperationsView({
  records,
  programs,
  requestedEventSlug,
  requestedStatus,
}: {
  readonly records: readonly AdminMerchantOperationRecord[];
  readonly programs: readonly MerchantBoothProgram[];
  readonly requestedEventSlug?: string;
  readonly requestedStatus?: string;
}): AdminMerchantOperationsView {
  const eventCounts = new Map<string, number>();
  for (const record of records) {
    eventCounts.set(record.application.eventSlug, (eventCounts.get(record.application.eventSlug) ?? 0) + 1);
  }
  const selectedEventSlug = requestedEventSlug && eventCounts.has(requestedEventSlug) ? requestedEventSlug : "";
  const selectedStatus = isMerchantApplicationStatus(requestedStatus) ? requestedStatus : "all";
  return {
    records: records
      .filter((record) => !selectedEventSlug || record.application.eventSlug === selectedEventSlug)
      .filter((record) => selectedStatus === "all" || record.application.status === selectedStatus),
    programs,
    eventOptions: Array.from(eventCounts, ([slug, count]) => ({ slug, label: slug, count })),
    selectedEventSlug,
    selectedStatus,
  };
}
