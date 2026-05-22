"use client";

import { useState, useTransition } from "react";
import { useLanguage } from "@/lib/language";
import type { Event, RegistrationFieldConfig } from "@/lib/types";
import { registerForEvent } from "@/lib/registrations/actions";

type Props = {
  event: Event;
};

type FormErrors = Record<string, string>;

function renderField(
  field: RegistrationFieldConfig,
  value: string,
  onChange: (v: string) => void,
  error: string | undefined,
  t: (b: { en: any; zh: any }) => any,
) {
  const label = t(field.label);
  const placeholder = field.placeholder ? t(field.placeholder) : undefined;

  const inputClass = `input-field ${error ? "border-red-400 focus:border-red-500 focus:ring-red-500" : ""}`;

  if (field.type === "select" && field.options) {
    const options = (field.options ? t(field.options) : []) as string[];
    return (
      <div key={field.key}>
        <label className="label" htmlFor={`field-${field.key}`}>
          {label} {field.required && <span className="text-red-500">*</span>}
        </label>
        <select id={`field-${field.key}`} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{placeholder || `— ${t({ en: "Select", zh: "请选择" })} —`}</option>
          {options.map((opt: string) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div key={field.key}>
        <label className="label" htmlFor={`field-${field.key}`}>
          {label} {field.required && <span className="text-red-500">*</span>}
        </label>
        <textarea id={`field-${field.key}`} className={inputClass} rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div key={field.key}>
      <label className="label" htmlFor={`field-${field.key}`}>
        {label} {field.required && <span className="text-red-500">*</span>}
      </label>
      <input id={`field-${field.key}`} type={field.type} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function RegistrationForm({ event }: Props) {
  const { lang, t } = useLanguage();
  const [, startTransition] = useTransition();
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState(false);

  function updateField(key: string, value: string) {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");

    const newErrors: FormErrors = {};

    for (const field of event.registrationFields) {
      if (field.required && !formData[field.key]?.trim()) {
        newErrors[field.key] = t({ en: "This field is required", zh: "此字段为必填" });
      }
      if (field.type === "email" && formData[field.key] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData[field.key])) {
        newErrors[field.key] = t({ en: "Invalid email address", zh: "邮箱格式不正确" });
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
          setSuccess(true);
        } else {
          setServerError(result.error || t({ en: "Registration failed", zh: "报名失败" }));
        }
      });
    });
  }

  if (success) {
    return (
      <div className="card border-green-200 bg-green-50 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
        </div>
        <h3 className="mt-4 text-lg font-semibold text-green-800">
          {t({ en: "Registration Confirmed!", zh: "报名成功！" })}
        </h3>
        <p className="mt-2 text-sm text-green-700">
          {t({
            en: `You're registered for ${t(event.title)}. A confirmation email will be sent to ${formData.email || "your email"}.`,
            zh: `你已成功报名 ${t(event.title)}。确认邮件将发送至 ${formData.email || "你的邮箱"}。`,
          })}
        </p>
        <p className="mt-2 text-xs text-green-600">
          {t({
            en: "We'll send more details closer to the event date.",
            zh: "活动临近时我们会发送更多详情。",
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

      {event.registrationFields.map((field) =>
        renderField(field, formData[field.key] || "", (v) => updateField(field.key, v), errors[field.key], t),
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
