import { MerchantOperationsView } from "@/components/admin/merchant-operations-view";
import { requireAdmin } from "@/lib/auth/admin";
import { getAllEvents } from "@/lib/events/repository";
import {
  allocateMerchantBoothAction,
  approveMerchantApplicationAction,
  publishBoothInstructionsAction,
  recordMerchantManualPaymentAction,
  reviewMerchantApplicationAction,
} from "@/lib/merchants/actions";
import { buildAdminMerchantView } from "@/lib/merchants/admin-view";
import { getMerchantAdminOperations } from "@/lib/merchants/application-state";

function queryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function feedback(searchParams: { readonly [key: string]: string | string[] | undefined }) {
  const success = searchParams.reviewed
    ? { en: "Review saved.", zh: "审核已保存。" }
    : searchParams.approved
      ? { en: "Application approved.", zh: "申请已批准。" }
      : searchParams.allocated
        ? { en: "Matching booth assigned.", zh: "已分配匹配摊位。" }
        : searchParams.instructionsPublished
          ? { en: "Offline instructions published.", zh: "线下付款说明已发布。" }
          : searchParams.paymentRecorded
            ? { en: "Manual payment confirmed.", zh: "手动付款已确认。" }
            : undefined;
  const errorCode = queryValue(searchParams.error);
  return {
    success,
    error: errorCode
      ? { en: `Merchant operation could not be completed (${errorCode}).`, zh: `商家操作未完成（${errorCode}）。` }
      : undefined,
  };
}

export default async function AdminMerchantsPage({
  searchParams = {},
}: {
  readonly searchParams?: { readonly [key: string]: string | string[] | undefined };
}) {
  await requireAdmin();
  const events = await getAllEvents();
  const merchantOperations = await getMerchantAdminOperations();
  const eventLabels = Object.fromEntries(
    events.map((event) => [event.slug, event.title]),
  );
  const view = buildAdminMerchantView({
    operations: merchantOperations,
    eventsBySlug: new Map(events.map((event) => [event.slug, event])),
    requestedEventSlug: queryValue(searchParams.event),
    requestedStatus: queryValue(searchParams.status),
  });

  return (
    <MerchantOperationsView
      view={view}
      eventLabels={eventLabels}
      feedback={feedback(searchParams)}
      reviewAction={reviewMerchantApplicationAction}
      approveAction={approveMerchantApplicationAction}
      allocateAction={allocateMerchantBoothAction}
      instructionAction={publishBoothInstructionsAction}
      paymentAction={recordMerchantManualPaymentAction}
    />
  );
}
