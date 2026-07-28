"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/lib/language";
import type { Bilingual, Event, EventRegistrationQuestion, MemberProfile } from "@/lib/types";
import { registerForEvent } from "@/lib/registrations/actions";
import { createCheckoutSessionAction } from "@/lib/payments/actions";

type Props = {
  event: Event;
  memberProfile?: MemberProfile | null;
  emailConfirmed?: boolean;
};

type AnswerValue = string | boolean | string[];
type FormDataState = Record<string, AnswerValue>;
type FormErrors = Record<string, string>;
type OptionPair = { value: string; label: string };

function localizedText(value: { en: string; zh: string }, lang: "en" | "zh") {
  return lang === "en" ? value.en || value.zh : value.zh || value.en;
}

function localizedOptionPairs(value: Bilingual<string[]>, lang: "en" | "zh") {
  const pairs: OptionPair[] = [];
  const activeOptions = value[lang];
  const fallbackOptions = lang === "en" ? value.zh : value.en;
  const optionCount = Math.max(value.zh.length, value.en.length);

  for (let index = 0; index < optionCount; index += 1) {
    const canonicalValue = value.zh[index] || value.en[index];
    if (!canonicalValue) continue;

    pairs.push({
      value: canonicalValue,
      label: activeOptions[index] || fallbackOptions[index] || canonicalValue,
    });
  }

  return pairs;
}

function isStringAnswer(value: AnswerValue | undefined): value is string {
  return typeof value === "string";
}

function isBooleanAnswer(value: AnswerValue | undefined): value is boolean {
  return typeof value === "boolean";
}

function isStringArrayAnswer(value: AnswerValue | undefined): value is string[] {
  return Array.isArray(value);
}

function renderQuestion(
  question: EventRegistrationQuestion,
  value: AnswerValue | undefined,
  onChange: (v: AnswerValue) => void,
  error: string | undefined,
  lang: "en" | "zh",
) {
  const label = localizedText(question.label, lang);
  const helpText = localizedText(question.helpText, lang);
  const options = localizedOptionPairs(question.options, lang);
  const inputClass = `input-field ${error ? "border-red-400 focus:border-red-500 focus:ring-red-500" : ""}`;

  if (question.type === "single_choice") {
    return (
      <div key={question.key}>
        <label className="label" htmlFor={`field-${question.key}`}>
          {label} {question.required && <span className="text-red-500">*</span>}
        </label>
        <select
          id={`field-${question.key}`}
          className={inputClass}
          value={isStringAnswer(value) ? value : ""}
          aria-invalid={Boolean(error) || undefined}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{lang === "en" ? "-- Select --" : "-- 请选择 --"}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {helpText && <p className="mt-1 text-xs text-gray-500">{helpText}</p>}
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  if (question.type === "yes_no") {
    return (
      <div key={question.key}>
        <label className="label" htmlFor={`field-${question.key}`}>
          {label} {question.required && <span className="text-red-500">*</span>}
        </label>
        <select
          id={`field-${question.key}`}
          className={inputClass}
          value={isBooleanAnswer(value) ? String(value) : ""}
          aria-invalid={Boolean(error) || undefined}
          onChange={(e) => {
            if (e.target.value === "true") onChange(true);
            if (e.target.value === "false") onChange(false);
            if (e.target.value === "") onChange("");
          }}
        >
          <option value="">{lang === "en" ? "-- Select --" : "-- 请选择 --"}</option>
          <option value="true">{lang === "en" ? "Yes" : "是"}</option>
          <option value="false">{lang === "en" ? "No" : "否"}</option>
        </select>
        {helpText && <p className="mt-1 text-xs text-gray-500">{helpText}</p>}
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  if (question.type === "multiple_choice") {
    const selected = isStringArrayAnswer(value) ? value : [];

    return (
      <div key={question.key}>
        <fieldset>
          <legend className="label">
            {label} {question.required && <span className="text-red-500">*</span>}
          </legend>
          <div className="space-y-2">
            {options.map((option) => (
              <label key={option.value} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-snow-600 focus:ring-snow-500"
                  checked={selected.includes(option.value)}
                  value={option.value}
                  aria-invalid={Boolean(error) || undefined}
                  onChange={(e) => {
                    onChange(e.target.checked ? [...selected, option.value] : selected.filter((item) => item !== option.value));
                  }}
                />
                <span className="text-sm text-gray-700">{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {helpText && <p className="mt-1 text-xs text-gray-500">{helpText}</p>}
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  const inputType = question.type === "phone" ? "tel" : question.type;

  return (
    <div key={question.key}>
      <label className="label" htmlFor={`field-${question.key}`}>
        {label} {question.required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={`field-${question.key}`}
        type={inputType}
        className={inputClass}
        value={isStringAnswer(value) ? value : ""}
        aria-invalid={Boolean(error) || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {helpText && <p className="mt-1 text-xs text-gray-500">{helpText}</p>}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function RegistrationForm({ event, memberProfile = null, emailConfirmed = false }: Props) {
  const { lang, t } = useLanguage();
  const searchParams = useSearchParams();
  const [isSubmitting, startTransition] = useTransition();
  const [formData, setFormData] = useState<FormDataState>({});
  const [consent, setConsent] = useState(false);
  const [waiverScrolled, setWaiverScrolled] = useState(false);
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState<"email" | "member">("email");
  const [pendingRegistrationId, setPendingRegistrationId] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const paymentCancelled = searchParams?.get("payment") === "cancelled";
  const [showWaiverModal, setShowWaiverModal] = useState(false);

  useEffect(() => {
    if (!showWaiverModal) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowWaiverModal(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showWaiverModal]);

  function updateField(key: string, value: AnswerValue) {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  }

  function isValidChoice(question: EventRegistrationQuestion, value: string) {
    const options = [...question.options.en, ...question.options.zh];
    return options.includes(value);
  }

  function submitRegistration(input: { consentGiven: boolean; waiverTextEn?: string; waiverTextSha?: string; typedName?: string }) {
    startTransition(() => {
      registerForEvent(event.slug, {
        answers: formData,
        consentGiven: input.consentGiven,
        lang,
        couponCode,
        ...(input.waiverTextEn && {
          waiverTextEn: input.waiverTextEn,
          waiverTextSha: input.waiverTextSha,
          typedName: input.typedName,
        }),
      }).then((result) => {
        if (result.success) {
          setShowWaiverModal(false);
          setPendingEmail(result.email);
          setPendingConfirmation(result.confirmation);
          setPendingRegistrationId(result.pendingRegistrationId);
        } else {
          setServerError(result.error || t({ en: "Registration failed", zh: "报名失败" }));
        }
      }).catch(() => {
        setServerError(t({ en: "Something went wrong. Please try again.", zh: "发生错误，请重试。" }));
      });
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");

    const newErrors: FormErrors = {};

    for (const question of event.registrationQuestions) {
      const value = formData[question.key];
      const missing =
        value === undefined ||
        (typeof value === "string" && value.trim() === "") ||
        (Array.isArray(value) && value.length === 0);

      if (question.required && missing) {
        newErrors[question.key] = t({ en: "This field is required", zh: "此字段为必填" });
        continue;
      }

      if (missing) continue;

      if (question.type === "yes_no" && typeof value !== "boolean") {
        newErrors[question.key] = t({ en: "Please choose yes or no", zh: "请选择是或否" });
      }

      if (question.type === "single_choice" && (!isStringAnswer(value) || !isValidChoice(question, value))) {
        newErrors[question.key] = t({ en: "Please select a valid option", zh: "请选择有效选项" });
      }

      if (
        question.type === "multiple_choice" &&
        (!isStringArrayAnswer(value) || value.some((item) => !isValidChoice(question, item)))
      ) {
        newErrors[question.key] = t({ en: "Please select valid options", zh: "请选择有效选项" });
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (event.waiverTextEn) {
      setShowWaiverModal(true);
    } else {
      if (!consent) {
        setErrors({ consent: t({ en: "You must agree to the terms", zh: "请同意相关条款" }) });
        return;
      }
      submitRegistration({ consentGiven: true });
    }
  }

  function handleConfirmWaiver() {
    const newErrors: FormErrors = {};

    if (!waiverScrolled) {
      newErrors.waiverScrolled = t({ en: "Please scroll to the bottom of the waiver", zh: "请滚动到免责声明底部" });
    }
    if (!waiverAccepted) {
      newErrors.waiverAccepted = t({ en: "You must accept the waiver", zh: "请接受免责声明" });
    }
    if (!typedName.trim()) {
      newErrors.typedName = t({ en: "Please type your full name as your electronic signature", zh: "请键入全名作为电子签名" });
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    submitRegistration({
      consentGiven: true,
      waiverTextEn: event.waiverTextEn!,
      waiverTextSha: event.waiverTextSha ?? undefined,
      typedName: typedName.trim(),
    });
  }

  if (pendingEmail && event.paymentModel === "free") {
    if (pendingConfirmation === "member") {
      return (
        <div className="card border-green-200 bg-green-50 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-green-800">
            {t({ en: "Confirm in your member home", zh: "请前往会员主页确认" })}
          </h3>
          <p className="mt-2 text-sm text-green-700">
            {t({
              en: `Your registration for ${t(event.title)} is waiting in your member home. Click Confirm there to complete it.`,
              zh: `${t(event.title)} 的报名已提交到会员主页，请在那里点击确认完成报名。`,
            })}
          </p>
          <p className="mt-2 text-xs text-green-600">
            {t({
              en: "No second email verification is needed while you are logged in.",
              zh: "登录状态下不需要再次邮箱验证。",
            })}
          </p>
          <a href="/member" className="mt-4 inline-flex rounded-full bg-green-700 px-5 py-2 text-sm font-semibold text-white">
            {t({ en: "Go to member home", zh: "前往会员主页" })}
          </a>
        </div>
      );
    }

    return (
      <div className="card border-green-200 bg-green-50 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
        </div>
        <h3 className="mt-4 text-lg font-semibold text-green-800">
          {t({ en: "Check your email", zh: "请查看邮箱" })}
        </h3>
        <p className="mt-2 text-sm text-green-700">
          {t({
            en: `We sent a confirmation link to ${pendingEmail}. Click it to complete your registration for ${t(event.title)}.`,
            zh: `我们已发送确认链接至 ${pendingEmail}。点击邮件链接后才会完成 ${t(event.title)} 的报名。`,
          })}
        </p>
        <p className="mt-2 text-xs text-green-600">
          {t({
            en: "Your registration will not appear in the admin list until the email is confirmed.",
            zh: "确认邮箱前，这条报名不会进入后台名单。",
          })}
        </p>
      </div>
    );
  }

  if (pendingRegistrationId && event.paymentModel !== "free") {
    const amount = event.paymentModel === "deposit" ? event.depositAmount : event.fullPaymentAmount;
    const currency = event.depositCurrency.toUpperCase();
    const label =
      event.paymentModel === "deposit"
        ? t({ en: `Pay deposit ${amount ?? ""} ${currency}`, zh: `支付押金 ${amount ?? ""} ${currency}` })
        : t({ en: `Pay full ${amount ?? ""} ${currency}`, zh: `支付全款 ${amount ?? ""} ${currency}` });

    return (
      <div className="card border-blue-200 bg-blue-50 text-center">
        <h3 className="text-lg font-semibold text-blue-950">{t({ en: "Payment required", zh: "需要支付" })}</h3>
        <p className="mt-2 text-sm text-blue-900">
          {t({
            en: "Your registration is pending payment. Click below to pay via Stripe.",
            zh: "你的报名待支付，点击下方按钮通过 Stripe 完成。",
          })}
        </p>
        {checkoutError && <p className="mt-2 text-sm text-red-700">{checkoutError}</p>}
        <button
          type="button"
          disabled={checkoutLoading}
          onClick={async () => {
            setCheckoutLoading(true);
            setCheckoutError("");
            const formData = new FormData();
            formData.append("pendingRegistrationId", pendingRegistrationId);
            const result = await createCheckoutSessionAction(formData);
            if (result.success && result.url) {
              window.location.href = result.url;
            } else {
              setCheckoutLoading(false);
              setCheckoutError(result.success ? "No checkout URL returned" : result.error);
            }
          }}
          className="mt-4 inline-flex rounded-full bg-blue-700 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {checkoutLoading ? t({ en: "Redirecting...", zh: "跳转中..." }) : label}
        </button>
      </div>
    );
  }

  if (!memberProfile) {
    return (
      <div className="card border-blue-200 bg-blue-50">
        <h3 className="text-lg font-semibold text-blue-950">
          {t({ en: "Member sign-in required", zh: "请先登录会员" })}
        </h3>
        <p className="mt-2 text-sm leading-6 text-blue-900">
          {t({
            en: "SnowForce event registration is member-only. Sign in or create a member account, verify your email, then return here to submit and confirm your registration.",
            zh: "SnowForce 活动报名仅限会员。请登录或注册会员，完成邮箱验证后回到这里提交并确认报名。",
          })}
        </p>
        <a href={`/member?next=/events/${event.slug}`} className="mt-4 inline-flex rounded-full bg-blue-700 px-5 py-2 text-sm font-semibold text-white">
          {t({ en: "Sign in to register", zh: "登录后报名" })}
        </a>
      </div>
    );
  }

  if (!emailConfirmed) {
    return (
      <div className="card border-amber-200 bg-amber-50">
        <h3 className="text-lg font-semibold text-amber-900">
          {t({ en: "Verify your email to register as a member", zh: "请先验证邮箱再使用会员报名" })}
        </h3>
        <p className="mt-2 text-sm leading-6 text-amber-800">
          {t({
            en: "SnowForce member registration uses your saved profile, so your account email must be verified first.",
            zh: "会员报名会使用你保存的资料，因此需要先完成邮箱验证。",
          })}
        </p>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="card space-y-5">
        <h3 className="text-lg font-semibold text-gray-900">
          {t({ en: "Register for this Event", zh: "报名参加此活动" })}
        </h3>

        {paymentCancelled && event.paymentModel !== "free" ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {t({
              en: "Payment was cancelled. You can submit again here or resume payment from your member home while the pending registration is still active.",
              zh: "支付已取消。你可以在这里重新提交，或在待确认报名仍有效时前往会员主页继续支付。",
            })}
          </div>
        ) : null}

        {event.registrationQuestions.map((question) =>
          renderQuestion(question, formData[question.key], (v) => updateField(question.key, v), errors[question.key], lang),
        )}

        {event.paymentModel !== "free" ? (
          <div>
            <label className="label" htmlFor="coupon-code">
              {t({ en: "Coupon code (optional)", zh: "优惠码（选填）" })}
            </label>
            <input
              id="coupon-code"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              maxLength={32}
              autoCapitalize="characters"
              className="input-field"
              placeholder={t({ en: "Enter coupon code", zh: "输入优惠码" })}
            />
            <p className="mt-1 text-xs text-gray-500">
              {t({ en: "The discount will be checked securely when you continue to payment.", zh: "继续付款时将安全验证并计算优惠。" })}
            </p>
          </div>
        ) : null}

        {!event.waiverTextEn && (
          <div>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-snow-600 focus:ring-snow-500"
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked);
                  if (errors.consent) setErrors((prev) => ({ ...prev, consent: "" }));
                }}
              />
              <span className="text-sm text-gray-600">
                {t({
                  en: "I agree to the event terms and understand that SnowForce will use my contact information for event communications only.",
                  zh: "我同意活动条款，并了解 SnowForce 仅会将我的联系信息用于本次活动沟通。",
                })}
              </span>
            </label>
            {errors.consent && <p className="mt-1 text-xs text-red-500">{errors.consent}</p>}
          </div>
        )}

        {serverError && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{serverError}</div>
        )}

        <button type="submit" className="btn-primary flex w-full items-center justify-center gap-2" disabled={isSubmitting}>
          {isSubmitting && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {isSubmitting
            ? t({ en: "Submitting...", zh: "提交中..." })
            : t({ en: "Submit Registration", zh: "提交报名" })}
        </button>
      </form>

      {showWaiverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowWaiverModal(false)} />
          <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {t({ en: "Waiver & Release of Liability", zh: "免责声明与责任豁免" })}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {t({ en: "Please read carefully and accept below to complete your registration.", zh: "请仔细阅读并接受以下条款以完成报名。" })}
              </p>
            </div>

            <div
              className="flex-1 overflow-y-auto px-6 py-4 text-sm text-gray-700"
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 5) {
                  setWaiverScrolled(true);
                }
              }}
            >
              {event.waiverTextEn!.split("\n").map((line, i) => (
                <p key={i} className="mb-2 last:mb-0">{line || "\u00A0"}</p>
              ))}
            </div>

            <div className="border-t px-6 py-4 space-y-3">
              {!waiverScrolled && (
                <p className="text-xs text-gray-500">
                  {t({ en: "Scroll to the bottom of the waiver to continue.", zh: "请滚动到免责声明底部以继续。" })}
                </p>
              )}

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  disabled={!waiverScrolled}
                  checked={waiverAccepted}
                  onChange={(e) => {
                    setWaiverAccepted(e.target.checked);
                    if (errors.waiverAccepted) setErrors((prev) => ({ ...prev, waiverAccepted: "" }));
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-snow-600 focus:ring-snow-500 disabled:opacity-40"
                />
                <span className="text-sm text-gray-600">
                  {t({
                    en: "I have read and understood the terms of this Release Agreement.",
                    zh: "我已阅读并理解本免责声明的条款。",
                  })}
                </span>
              </label>
              {errors.waiverAccepted && <p className="text-xs text-red-500">{errors.waiverAccepted}</p>}

              <div>
                <label className="block text-sm text-gray-600">
                  {t({ en: "Full name (electronic signature)", zh: "全名（电子签名）" })}
                  <input
                    type="text"
                    value={typedName}
                    onChange={(e) => {
                      setTypedName(e.target.value);
                      if (errors.typedName) setErrors((prev) => ({ ...prev, typedName: "" }));
                    }}
                    placeholder={t({ en: "Type your full name", zh: "请键入全名" })}
                    className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>
                {errors.typedName && <p className="text-xs text-red-500">{errors.typedName}</p>}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t px-6 py-4">
              <button
                type="button"
                onClick={() => setShowWaiverModal(false)}
                className="rounded-full px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                {t({ en: "Cancel", zh: "取消" })}
              </button>
              <button
                type="button"
                onClick={handleConfirmWaiver}
                disabled={isSubmitting}
                className="btn-primary flex items-center gap-2"
              >
                {isSubmitting && (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {isSubmitting
                  ? t({ en: "Submitting...", zh: "提交中..." })
                  : t({ en: "Confirm & Submit", zh: "确认并提交" })}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
