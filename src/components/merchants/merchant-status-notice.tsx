"use client";

import { useLanguage } from "@/lib/language";

type SearchParams = Record<string, string | undefined>;
type NoticeTone = "info" | "success" | "warning" | "error";

const errorMessages: Record<string, { en: string; zh: string }> = {
  login: { en: "Sign in to continue with your merchant account.", zh: "请登录商户账号后继续。" },
  "verification-email": { en: "Verify your email before submitting a booth application.", zh: "提交摊位申请前请先验证邮箱。" },
  profile: { en: "Your merchant profile is required before applying.", zh: "申请前需要完成商户资料。" },
  "invalid-input": { en: "Review the highlighted application details and try again.", zh: "请检查标出的申请信息后重试。" },
  "program-disabled": { en: "This event is no longer accepting merchant booth applications.", zh: "该活动目前不再接受商户摊位申请。" },
  "plan-not-found": { en: "That booth plan is no longer available. Choose another plan.", zh: "该摊位方案已不可用，请选择其他方案。" },
  "duplicate-application": { en: "You already have an active application for this event.", zh: "你已提交该活动的有效申请。" },
  "no-available-booth": { en: "This booth plan is currently full. Choose another plan or event.", zh: "该摊位方案目前已满，请选择其他方案或活动。" },
  unauthorized: { en: "Sign in to manage booth applications.", zh: "请登录后管理摊位申请。" },
  unverified: { en: "Verify your email before submitting a booth application.", zh: "提交摊位申请前请先验证邮箱。" },
  "event-not-found": { en: "That event is no longer available.", zh: "该活动已不可用。" },
  "event-archived": { en: "That event is no longer accepting applications.", zh: "该活动不再接受申请。" },
};

function resolveNotice(searchParams: SearchParams): { tone: NoticeTone; message: { en: string; zh: string } } | null {
  if (searchParams.submitted) return { tone: "success", message: { en: "Application submitted. SnowForce will review it shortly.", zh: "申请已提交，SnowForce 将尽快审核。" } };
  if (searchParams.withdrawn) return { tone: "info", message: { en: "Your application has been withdrawn.", zh: "你的申请已撤回。" } };
  if (searchParams.profileSaved) return { tone: "success", message: { en: "Merchant profile saved.", zh: "商户资料已保存。" } };
  if (searchParams.registered) return { tone: "success", message: { en: "Account created. Check your email to verify it, then sign in.", zh: "账号已创建。请查看邮箱完成验证后再登录。" } };
  if (searchParams.verificationSent || searchParams.magicSent) return { tone: "info", message: { en: "If the account exists, a secure email has been sent. Check your inbox.", zh: "如果账号存在，安全邮件已发送，请检查收件箱。" } };
  const error = searchParams.error ?? searchParams.profileError;
  return error ? { tone: "error", message: errorMessages[error] ?? { en: "We could not complete that request. Please try again.", zh: "暂时无法完成该请求，请重试。" } } : null;
}

export function MerchantStatusNotice({ searchParams }: { searchParams: SearchParams }) {
  const { t } = useLanguage();
  const notice = resolveNotice(searchParams);
  if (!notice) return null;
  const toneClass = notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : notice.tone === "success" ? "border-green-200 bg-green-50 text-green-800" : notice.tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-[#e0effe] bg-[#f0f7ff] text-[#0555a1]";
  return <div className={`mt-4 rounded-[12px] border p-4 text-[17px] leading-[1.47] tracking-[-0.374px] ${toneClass}`} role={notice.tone === "error" ? "alert" : "status"} aria-live="polite">{t(notice.message)}</div>;
}
