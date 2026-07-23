"use client";

import { useLanguage } from "@/lib/language";
import { saveMerchantProfile } from "@/lib/merchants/actions";
import type { MerchantProfile } from "@/lib/merchants/types";

type MerchantProfileFormProps = {
  readonly profile: MerchantProfile;
  readonly error?: string;
};

export function MerchantProfileForm({ profile, error }: MerchantProfileFormProps) {
  const { t } = useLanguage();

  return (
    <form action={saveMerchantProfile} className="merchant-portal-card space-y-5">
      <div>
        <p className="label text-snow-700">{t({ en: "Merchant profile", zh: "商家资料" })}</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--sf-ink)]">{t({ en: "Keep your application details ready", zh: "保持申请资料完整" })}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--sf-text-muted)]">{t({ en: "Your saved details prefill future booth applications. Updates never change a submitted application record.", zh: "保存的资料会预填未来的展位申请。更新不会更改已提交的申请记录。" })}</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <ProfileField id="merchant-profile-business" name="businessName" label={t({ en: "Business name", zh: "商家名称" })} defaultValue={profile.businessName} />
        <ProfileField id="merchant-profile-contact" name="contactName" label={t({ en: "Contact name", zh: "联系人姓名" })} defaultValue={profile.contactName} />
        <ProfileField id="merchant-profile-email" name="contactEmail" label={t({ en: "Contact email", zh: "联系邮箱" })} defaultValue={profile.contactEmail} type="email" />
        <ProfileField id="merchant-profile-phone" name="contactPhone" label={t({ en: "Contact phone", zh: "联系电话" })} defaultValue={profile.contactPhone} type="tel" required={false} />
      </div>
      <ProfileField id="merchant-profile-category" name="category" label={t({ en: "Business category", zh: "商家类别" })} defaultValue={profile.category} />
      <div>
        <label htmlFor="merchant-profile-description" className="label">{t({ en: "Business description", zh: "商家介绍" })}</label>
        <textarea id="merchant-profile-description" name="description" defaultValue={profile.description} rows={5} className="input-field min-h-32 rounded-[var(--sf-radius-card)]" />
      </div>
      <label htmlFor="merchant-profile-language" className="label">{t({ en: "Preferred language", zh: "首选语言" })}</label>
      <select id="merchant-profile-language" name="preferredLanguage" defaultValue="zh" className="input-field">
        <option value="zh">{t({ en: "Chinese", zh: "中文" })}</option>
        <option value="en">{t({ en: "English", zh: "英文" })}</option>
      </select>
      {error ? <p className="text-sm text-[var(--sf-status-error)]" role="alert">{t({ en: "Review the profile details and try again.", zh: "请检查商家资料后重试。" })}</p> : null}
      <button className="btn-primary w-full">{t({ en: "Save merchant profile", zh: "保存商家资料" })}</button>
    </form>
  );
}

function ProfileField({
  id,
  name,
  label,
  defaultValue,
  type = "text",
  required = true,
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly defaultValue: string;
  readonly type?: "text" | "email" | "tel";
  readonly required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}{required ? " *" : ""}</label>
      <input id={id} name={name} type={type} defaultValue={defaultValue} required={required} className="input-field" />
    </div>
  );
}
