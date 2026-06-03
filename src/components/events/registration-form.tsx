"use client";

import { useState, useTransition } from "react";
import { useLanguage } from "@/lib/language";
import type { Bilingual, Event, EventRegistrationQuestion, MemberProfile } from "@/lib/types";
import { registerForEvent } from "@/lib/registrations/actions";

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
  const [, startTransition] = useTransition();
  const [formData, setFormData] = useState<FormDataState>({});
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState<"email" | "member">("email");

  function updateField(key: string, value: AnswerValue) {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  }

  function isValidChoice(question: EventRegistrationQuestion, value: string) {
    const options = [...question.options.en, ...question.options.zh];
    return options.includes(value);
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

    if (!consent) {
      newErrors.consent = t({ en: "You must agree to the terms", zh: "请同意相关条款" });
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    startTransition(() => {
      registerForEvent(event.slug, {
        answers: formData,
        consentGiven: consent,
        lang,
      }).then((result) => {
        if (result.success) {
          setPendingEmail(result.email);
          setPendingConfirmation(result.confirmation);
        } else {
          setServerError(result.error || t({ en: "Registration failed", zh: "报名失败" }));
        }
      });
    });
  }

  if (pendingEmail) {
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

  if (memberProfile && !emailConfirmed) {
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
    <form onSubmit={handleSubmit} className="card space-y-5">
      <h3 className="text-lg font-semibold text-gray-900">
        {t({ en: "Register for this Event", zh: "报名参加此活动" })}
      </h3>

      {event.registrationQuestions.map((question) =>
        renderQuestion(question, formData[question.key], (v) => updateField(question.key, v), errors[question.key], lang),
      )}

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

      {serverError && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{serverError}</div>
      )}

      <button type="submit" className="btn-primary w-full">
        {t({ en: "Submit Registration", zh: "提交报名" })}
      </button>
    </form>
  );
}
