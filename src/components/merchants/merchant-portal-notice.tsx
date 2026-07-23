"use client";

import { useLanguage } from "@/lib/language";

type MerchantPortalNoticeProps = {
  readonly searchParams: Readonly<Record<string, string | undefined>>;
};

const errors = {
  unauthorized: { en: "Sign in with your merchant account to continue.", zh: "请使用商家账号登录后继续。" },
  unverified: { en: "Verify your merchant email before applying.", zh: "申请前请先验证商家邮箱。" },
  "no-profile": { en: "Complete your merchant profile before applying.", zh: "申请前请完善商家资料。" },
  "event-not-found": { en: "That event is no longer available for merchant applications.", zh: "该活动不再接受商家申请。" },
  "program-disabled": { en: "Merchant booths are not enabled for that event.", zh: "该活动未开放商家展位。" },
  "plan-not-found": { en: "Choose an available booth plan and try again.", zh: "请选择可用的展位方案后重试。" },
  "duplicate-application": { en: "You already have an active application for this event.", zh: "你已提交过该活动的有效申请。" },
  "invalid-input": { en: "Review the highlighted application information and try again.", zh: "请检查标出的申请信息后重试。" },
  "no-available-booth": { en: "That booth plan is currently unavailable. Choose another plan.", zh: "该展位方案当前不可用。请选择其他方案。" },
  "invalid-status-transition": { en: "This application can no longer be changed from its current state.", zh: "该申请当前状态无法继续更改。" },
} as const;

function messageFor(error: string | undefined) {
  if (!error) return undefined;
  if (error === "unauthorized") return errors.unauthorized;
  if (error === "unverified") return errors.unverified;
  if (error === "no-profile") return errors["no-profile"];
  if (error === "event-not-found") return errors["event-not-found"];
  if (error === "program-disabled") return errors["program-disabled"];
  if (error === "plan-not-found") return errors["plan-not-found"];
  if (error === "duplicate-application") return errors["duplicate-application"];
  if (error === "invalid-input") return errors["invalid-input"];
  if (error === "no-available-booth") return errors["no-available-booth"];
  if (error === "invalid-status-transition") return errors["invalid-status-transition"];
  return { en: "We could not update your merchant application. Please try again.", zh: "无法更新商家申请，请重试。" };
}

export function MerchantPortalNotice({ searchParams }: MerchantPortalNoticeProps) {
  const { t } = useLanguage();
  const error = messageFor(searchParams.error);
  const success = searchParams.submitted
    ? { en: "Application submitted. SnowForce will review it soon.", zh: "申请已提交。SnowForce 将尽快审核。" }
    : searchParams.withdrawn
      ? { en: "Application withdrawn.", zh: "申请已撤回。" }
      : searchParams.profileSaved
        ? { en: "Merchant profile saved.", zh: "商家资料已保存。" }
        : undefined;

  if (!error && !success) return null;

  const message = error ?? success;
  if (!message) return null;

  return (
    <p className={`merchant-status ${error ? "text-[var(--sf-status-error)]" : "text-snow-700"}`} role={error ? "alert" : "status"} aria-live="polite">
      {t(message)}
    </p>
  );
}
