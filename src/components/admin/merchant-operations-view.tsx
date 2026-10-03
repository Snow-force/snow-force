"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/language";
import {
  adminMerchantApplicationStatuses,
  type AdminMerchantView,
} from "@/lib/merchants/admin-view";
import type { MerchantBoothProgram } from "@/lib/merchants/types";
import { MerchantOperationActions, type MerchantFormAction } from "./merchant-operation-actions";

type MerchantOperationsViewProps = {
  readonly view: AdminMerchantView;
  readonly eventLabels: Readonly<Record<string, { readonly en: string; readonly zh: string }>>;
  readonly feedback: {
    readonly success?: { readonly en: string; readonly zh: string };
    readonly error?: { readonly en: string; readonly zh: string };
  };
  readonly reviewAction: MerchantFormAction;
  readonly approveAction: MerchantFormAction;
  readonly allocateAction: MerchantFormAction;
  readonly instructionAction: MerchantFormAction;
  readonly paymentAction: MerchantFormAction;
};

const statusClasses = {
  submitted: "bg-gray-100 text-gray-700",
  under_review: "bg-snow-50 text-snow-700",
  approved: "bg-green-50 text-green-700",
  payment_pending: "bg-amber-50 text-amber-800",
  paid: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
  withdrawn: "bg-gray-100 text-gray-500",
} as const;

function formatMoney(amount: number, currency: string) {
  return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
}

function statusLabel(status: keyof typeof statusClasses) {
  return {
    submitted: { en: "Submitted", zh: "已提交" },
    under_review: { en: "Under review", zh: "审核中" },
    approved: { en: "Approved", zh: "已批准" },
    payment_pending: { en: "Payment pending", zh: "待付款" },
    paid: { en: "Paid", zh: "已付款" },
    rejected: { en: "Rejected", zh: "已拒绝" },
    withdrawn: { en: "Withdrawn", zh: "已撤回" },
  }[status];
}

function OfflineInstructionsForm({
  program,
  returnEvent,
  returnStatus,
  action,
}: {
  readonly program: MerchantBoothProgram;
  readonly returnEvent: string;
  readonly returnStatus: string;
  readonly action: MerchantFormAction;
}) {
  const { t } = useLanguage();
  const [english, setEnglish] = useState(program.paymentInstructionsEn);
  const [chinese, setChinese] = useState(program.paymentInstructionsZh);

  return (
    <form action={action} className="grid gap-3 border-t border-gray-200 pt-4 md:grid-cols-2">
      <input type="hidden" name="programId" value={program.id} />
      <input type="hidden" name="returnEvent" value={returnEvent} />
      <input type="hidden" name="returnStatus" value={returnStatus} />
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
        {t({ en: "Offline instructions (English)", zh: "线下付款说明（英文）" })}
        <textarea
          name="paymentInstructionsEn"
          value={english}
          onChange={(event) => setEnglish(event.currentTarget.value)}
          rows={3}
          className="rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-snow-500 focus:ring-2 focus:ring-snow-100"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
        {t({ en: "Offline instructions (Chinese)", zh: "线下付款说明（中文）" })}
        <textarea
          name="paymentInstructionsZh"
          value={chinese}
          onChange={(event) => setChinese(event.currentTarget.value)}
          rows={3}
          className="rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-snow-500 focus:ring-2 focus:ring-snow-100"
        />
      </label>
      <div className="md:col-span-2">
        <button className="btn-primary px-3 py-2 text-sm">
          {t({ en: "Publish instructions", zh: "发布付款说明" })}
        </button>
      </div>
    </form>
  );
}

export function MerchantOperationsView({
  view,
  eventLabels,
  feedback,
  reviewAction,
  approveAction,
  allocateAction,
  instructionAction,
  paymentAction,
}: MerchantOperationsViewProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{t({ en: "Merchant Operations", zh: "商家运营管理" })}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {t({ en: "Review applications, assign compatible booths, and confirm offline payments.", zh: "审核申请、分配兼容摊位并确认线下付款。" })}
          </p>
        </div>
        <p className="text-sm text-gray-500">
          {t({ en: `${view.selectedItems.length} matching application(s)`, zh: `共 ${view.selectedItems.length} 条匹配申请` })}
        </p>
      </div>

      {feedback.success ? <p className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{t(feedback.success)}</p> : null}
      {feedback.error ? <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{t(feedback.error)}</p> : null}

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-56 flex-col gap-1 text-sm font-medium text-gray-700">
          {t({ en: "Event", zh: "活动" })}
          <select
            name="event"
            defaultValue={view.selectedEventSlug}
            className="rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-snow-500 focus:ring-2 focus:ring-snow-100"
          >
            <option value="">{t({ en: "All events", zh: "所有活动" })}</option>
            {view.eventOptions.map((option) => (
              <option key={option.slug} value={option.slug}>
                {t(eventLabels[option.slug] ?? { en: option.slug, zh: option.slug })} ({option.count})
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-col gap-1 text-sm font-medium text-gray-700">
          {t({ en: "Application state", zh: "申请状态" })}
          <select
            name="status"
            defaultValue={view.selectedStatus}
            className="rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-snow-500 focus:ring-2 focus:ring-snow-100"
          >
            <option value="">{t({ en: "All states", zh: "所有状态" })}</option>
            {adminMerchantApplicationStatuses.map((status) => (
              <option key={status} value={status}>{t(statusLabel(status))}</option>
            ))}
          </select>
        </label>
        <button className="btn-primary px-4 py-2 text-sm">{t({ en: "Apply filters", zh: "应用筛选" })}</button>
      </form>

      {view.instructionPrograms.map((program) => (
        <section key={program.id} className="card">
          <h3 className="text-base font-semibold text-gray-900">
            {t({ en: "Offline payment instructions", zh: "线下付款说明" })} · {t(eventLabels[program.eventSlug] ?? { en: program.eventSlug, zh: program.eventSlug })}
          </h3>
          <OfflineInstructionsForm
            key={JSON.stringify([program.paymentInstructionsEn, program.paymentInstructionsZh])}
            program={program}
            returnEvent={view.selectedEventSlug}
            returnStatus={view.selectedStatus}
            action={instructionAction}
          />
        </section>
      ))}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-400">
              <th className="py-3 pr-4">{t({ en: "Business / contact", zh: "商家 / 联系人" })}</th>
              <th className="px-4 py-3">{t({ en: "Event / plan", zh: "活动 / 方案" })}</th>
              <th className="px-4 py-3">{t({ en: "Booth", zh: "摊位" })}</th>
              <th className="px-4 py-3">{t({ en: "State history", zh: "状态记录" })}</th>
              <th className="px-4 py-3">{t({ en: "Price / payment", zh: "价格 / 付款" })}</th>
              <th className="py-3 pl-4">{t({ en: "Controls", zh: "操作" })}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {view.selectedItems.map((record) => {
              const { application, plan, assignedBooth, payment } = record;
              return (
                <tr key={application.id} className="align-top hover:bg-gray-50">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-gray-900">{application.businessName}</p>
                    <p className="text-xs text-gray-500">{application.contactName} · {application.contactEmail}</p>
                    <p className="mt-1 text-xs text-gray-400">{application.category}{application.contactPhone ? ` · ${application.contactPhone}` : ""}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <p>{t(eventLabels[application.eventSlug] ?? { en: application.eventSlug, zh: application.eventSlug })}</p>
                    <p className="text-xs text-gray-400">{plan ? `${plan.nameEn} / ${plan.nameZh}` : application.requestedPlanId}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {assignedBooth ? <><p className="font-medium text-gray-900">{assignedBooth.boothCode}</p><p className="text-xs text-gray-400">{t({ en: "Assigned", zh: "已分配" })}</p></> : <span className="text-xs text-gray-400">{t({ en: "Unassigned", zh: "未分配" })}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses[application.status]}`}>{t(statusLabel(application.status))}</span>
                    <p className="mt-2 text-xs text-gray-400">{t({ en: "Submitted", zh: "提交" })}: {new Date(application.createdAt).toLocaleDateString()}</p>
                    <p className="text-xs text-gray-400">{t({ en: "Updated", zh: "更新" })}: {new Date(application.updatedAt).toLocaleDateString()}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <p className="font-medium text-gray-900">{formatMoney(application.quotedAmount, application.quotedCurrency)}</p>
                    {payment ? <><p className="mt-1 text-xs text-green-700">{t({ en: "Confirmed", zh: "已确认" })}</p><p className="text-xs text-gray-400">{payment.method} · {payment.reference}</p></> : <p className="mt-1 text-xs text-gray-400">{t({ en: "No manual payment", zh: "尚未登记付款" })}</p>}
                  </td>
                  <td className="py-3 pl-4">
                    <MerchantOperationActions
                      record={record}
                      returnEvent={view.selectedEventSlug}
                      returnStatus={view.selectedStatus}
                      reviewAction={reviewAction}
                      approveAction={approveAction}
                      allocateAction={allocateAction}
                      paymentAction={paymentAction}
                    />
                  </td>
                </tr>
              );
            })}
            {view.selectedItems.length === 0 ? <tr><td colSpan={6} className="py-10 text-center text-sm text-gray-400">{t({ en: "No merchant applications match these filters.", zh: "没有符合筛选条件的商家申请。" })}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
