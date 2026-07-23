"use client";

import { useMemo, useState } from "react";
import { submitMerchantApplicationAction } from "@/lib/merchants/actions";
import { useLanguage } from "@/lib/language";
import type { MerchantProfile } from "@/lib/merchants/types";
import type { Event } from "@/lib/types";

type MerchantApplicationFormProps = {
  readonly event?: Event;
  readonly events?: Event[];
  readonly profile: MerchantProfile;
  readonly selectedPlanId?: string;
  readonly initialEventSlug?: string;
};

type FormErrors = Record<string, string>;

export function MerchantApplicationForm({ event: eventProp, events = [], profile, selectedPlanId, initialEventSlug }: MerchantApplicationFormProps) {
  const { lang, t } = useLanguage();
  const [eventSlug, setEventSlug] = useState(initialEventSlug ?? eventProp?.slug ?? events[0]?.slug ?? "");
  const [errors, setErrors] = useState<FormErrors>({});
  const event = useMemo(() => eventProp ?? events.find((candidate) => candidate.slug === eventSlug), [eventProp, events, eventSlug]);
  if (!event) return null;
  const program = event.merchantBoothProgram;

  if (!program?.enabled) return null;

  const defaultPlanId = program.plans.some((plan) => plan.id === selectedPlanId) ? selectedPlanId : program.plans[0]?.id;

  function validateForm(form: HTMLFormElement): FormErrors {
    const data = new FormData(form);
    const nextErrors: FormErrors = {};
    const required = ["requestedPlanId", "businessName", "contactName", "contactEmail", "category"] as const;
    for (const name of required) {
      if (!String(data.get(name) ?? "").trim()) nextErrors[name] = t({ en: "This field is required.", zh: "此字段为必填。" });
    }
    const email = String(data.get("contactEmail") ?? "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.contactEmail = t({ en: "Enter a valid email address.", zh: "请输入有效的邮箱地址。" });
    }
    return nextErrors;
  }

  return (
    <form
      action={submitMerchantApplicationAction}
      className="merchant-portal-card space-y-5"
      noValidate
      onSubmit={(eventSubmit) => {
        const nextErrors = validateForm(eventSubmit.currentTarget);
        if (Object.keys(nextErrors).length === 0) return;
        eventSubmit.preventDefault();
        setErrors(nextErrors);
      }}
    >
      <input type="hidden" name="eventSlug" value={event.slug} />
      <div>
        <p className="label text-snow-700">{t({ en: "Merchant booth application", zh: "商家展位申请" })}</p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--sf-ink)]">{t(event.title)}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--sf-text-muted)]">
          {t({ en: "Choose one plan. SnowForce confirms booth allocation and offline payment details after review.", zh: "请选择一个方案。SnowForce 将在审核后确认展位分配和线下付款说明。" })}
        </p>
      </div>

      {!eventProp && events.length > 1 ? (
        <div>
          <label htmlFor="merchant-event" className="label">{t({ en: "Event", zh: "活动" })}</label>
          <select id="merchant-event" value={eventSlug} onChange={(changeEvent) => setEventSlug(changeEvent.target.value)} className="input-field">
            {events.map((candidate) => <option key={candidate.slug} value={candidate.slug}>{t(candidate.title)}</option>)}
          </select>
        </div>
      ) : null}

      <FieldError error={errors.requestedPlanId} errorId="merchant-plan-error">
        <label htmlFor="merchant-plan" className="label">{t({ en: "Booth plan", zh: "展位方案" })}</label>
        <select id="merchant-plan" name="requestedPlanId" defaultValue={defaultPlanId} className={`input-field ${errors.requestedPlanId ? "merchant-field-error" : ""}`} aria-invalid={Boolean(errors.requestedPlanId) || undefined}>
          {program.plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {`${lang === "en" ? plan.name.en : plan.name.zh} — ${plan.priceAmount} ${plan.priceCurrency.toUpperCase()}`}
            </option>
          ))}
        </select>
      </FieldError>

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField id="merchant-business-name" name="businessName" label={t({ en: "Business name", zh: "商家名称" })} defaultValue={profile.businessName} error={errors.businessName} />
        <TextField id="merchant-contact-name" name="contactName" label={t({ en: "Contact name", zh: "联系人姓名" })} defaultValue={profile.contactName} error={errors.contactName} />
        <TextField id="merchant-contact-email" name="contactEmail" label={t({ en: "Contact email", zh: "联系邮箱" })} type="email" defaultValue={profile.contactEmail} error={errors.contactEmail} />
        <TextField id="merchant-contact-phone" name="contactPhone" label={t({ en: "Contact phone", zh: "联系电话" })} type="tel" defaultValue={profile.contactPhone} error={errors.contactPhone} required={false} />
      </div>

      <TextField id="merchant-category" name="category" label={t({ en: "Business category", zh: "商家类别" })} defaultValue={profile.category} error={errors.category} />
      <FieldError error={errors.description} errorId="merchant-description-error">
        <label htmlFor="merchant-description" className="label">{t({ en: "Business description", zh: "商家介绍" })}</label>
        <textarea id="merchant-description" name="description" defaultValue={profile.description} rows={4} className="input-field min-h-28 rounded-[var(--sf-radius-card)]" aria-invalid={Boolean(errors.description) || undefined} />
      </FieldError>

      <p className="text-sm leading-6 text-[var(--sf-text-muted)]">
        {t({ en: "Submitting does not create a payment. SnowForce will contact approved merchants with offline instructions.", zh: "提交申请不会发起付款。SnowForce 将向获批商家发送线下付款说明。" })}
      </p>
      <button className="btn-primary w-full">{t({ en: "Submit booth application", zh: "提交展位申请" })}</button>
    </form>
  );
}

function FieldError({ children, error, errorId }: { readonly children: React.ReactNode; readonly error?: string; readonly errorId?: string }) {
  return (
    <div>
      {children}
      {error ? <p id={errorId} className="mt-1 text-sm text-[var(--sf-status-error)]" role="alert">{error}</p> : null}
    </div>
  );
}

function TextField({
  id,
  name,
  label,
  defaultValue,
  error,
  type = "text",
  required = true,
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly defaultValue: string;
  readonly error?: string;
  readonly type?: "text" | "email" | "tel";
  readonly required?: boolean;
}) {
  return (
    <FieldError error={error} errorId={`${id}-error`}>
      <label htmlFor={id} className="label">{label}{required ? " *" : ""}</label>
      <input id={id} name={name} type={type} defaultValue={defaultValue} required={required} className={`input-field ${error ? "merchant-field-error" : ""}`} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? `${id}-error` : undefined} />
    </FieldError>
  );
}
