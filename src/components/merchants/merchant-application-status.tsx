"use client";

import type { MerchantApplicationStatus } from "@/lib/merchants/types";
import { useLanguage } from "@/lib/language";
import type { MerchantApplicationState } from "@/lib/merchants/portal";
import type { Event } from "@/lib/types";

type MerchantApplicationStatusProps = {
  readonly event: Event;
  readonly state: MerchantApplicationState;
};

function assertNever(value: never): never {
  throw new Error(`Unhandled merchant application status: ${value}`);
}

function statusCopy(status: MerchantApplicationStatus) {
  switch (status) {
    case "submitted":
      return { en: "Application submitted", zh: "申请已提交" };
    case "under_review":
      return { en: "Under review", zh: "审核中" };
    case "approved":
      return { en: "Approved — booth assignment pending", zh: "已批准，等待分配展位" };
    case "payment_pending":
      return { en: "Booth assigned — offline payment pending", zh: "展位已分配，等待线下付款" };
    case "paid":
      return { en: "Offline payment confirmed", zh: "线下付款已确认" };
    case "rejected":
      return { en: "Application not approved", zh: "申请未获批准" };
    case "withdrawn":
      return { en: "Application withdrawn", zh: "申请已撤回" };
    default:
      return assertNever(status);
  }
}

function localizedInstructions(event: Event, lang: "en" | "zh") {
  const program = event.merchantBoothProgram;
  if (!program) return "";
  return lang === "en" ? program.paymentInstructions.en : program.paymentInstructions.zh;
}

export function MerchantApplicationStatus({ event, state }: MerchantApplicationStatusProps) {
  const { lang, t } = useLanguage();
  const instructions = localizedInstructions(event, lang);
  const status = state.application.status;
  const showInstructions = status === "payment_pending" || status === "paid";

  return (
    <section className="merchant-status" aria-labelledby={`merchant-status-${state.application.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label text-snow-700">{t({ en: "Application status", zh: "申请状态" })}</p>
          <h2 id={`merchant-status-${state.application.id}`} className="mt-1 text-xl font-semibold text-[var(--sf-ink)]">
            {t(statusCopy(status))}
          </h2>
        </div>
        <span className="rounded-full bg-[var(--sf-snow-100)] px-3 py-1 text-sm font-semibold text-snow-700">
          {t({ en: "Merchant booth", zh: "商家展位" })}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--sf-text-muted)]">{t({ en: "Requested plan", zh: "申请方案" })}</dt>
          <dd className="mt-1 font-semibold text-[var(--sf-ink)]">
            {state.plan ? (lang === "en" ? state.plan.nameEn : state.plan.nameZh) : t({ en: "Plan unavailable", zh: "方案不可用" })}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--sf-text-muted)]">{t({ en: "Assigned booth", zh: "分配展位" })}</dt>
          <dd className="mt-1 font-semibold text-[var(--sf-ink)]">
            {state.allocation?.boothId ?? t({ en: "Awaiting assignment", zh: "等待分配" })}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--sf-text-muted)]">{t({ en: "Quoted fee", zh: "报价" })}</dt>
          <dd className="mt-1 font-semibold text-[var(--sf-ink)]">
            {`${state.application.quotedAmount} ${state.application.quotedCurrency.toUpperCase()}`}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--sf-text-muted)]">{t({ en: "Payment confirmation", zh: "付款确认" })}</dt>
          <dd className="mt-1 font-semibold text-[var(--sf-ink)]">
            {state.payment ? t({ en: "Confirmed by SnowForce", zh: "SnowForce 已确认" }) : t({ en: "Not confirmed", zh: "尚未确认" })}
          </dd>
        </div>
      </dl>

      {showInstructions ? (
        <div className="mt-4 border-t border-[var(--sf-border-soft)] pt-4">
          <p className="label">{t({ en: "Offline payment instructions", zh: "线下付款说明" })}</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[var(--sf-text-strong)]">
            {instructions || t({ en: "SnowForce will share offline payment instructions with you.", zh: "SnowForce 将向你提供线下付款说明。" })}
          </p>
        </div>
      ) : null}
    </section>
  );
}
