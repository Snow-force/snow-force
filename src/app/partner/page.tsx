"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/language";
import { submitPartnerInquiry } from "@/lib/inquiries/actions";

export default function PartnerPage() {
  const { t } = useLanguage();
  const [form, setForm] = useState({ organizationName: "", contactName: "", contactEmail: "", contactPhone: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  function update(k: string, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: "" }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.organizationName.trim()) errs.organizationName = t({ en: "Required", zh: "必填" });
    if (!form.contactName.trim()) errs.contactName = t({ en: "Required", zh: "必填" });
    if (!form.contactEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)) errs.contactEmail = t({ en: "Valid email required", zh: "请输入有效邮箱" });
    if (!form.message.trim()) errs.message = t({ en: "Required", zh: "必填" });
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    const result = await submitPartnerInquiry(form);
    if (result.success) setSubmitted(true);
    else setErrors({ message: result.error });
  }

  return (
    <div className="py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h1 className="section-title">
          {t({ en: "Partner With SnowForce", zh: "与 SnowForce 合作" })}
        </h1>
        <p className="mt-2 text-gray-500">
          {t({
            en: "Interested in collaborating? Tell us about your organization and how you'd like to work together.",
            zh: "有兴趣合作？告诉我们你的组织信息和合作想法。",
          })}
        </p>

        {submitted ? (
          <div className="mt-8 card border-green-200 bg-green-50 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-green-800">
              {t({ en: "Inquiry Submitted!", zh: "咨询已提交！" })}
            </h3>
            <p className="mt-2 text-sm text-green-700">
              {t({
                en: "Thanks for reaching out! We'll get back to you within 3 business days.",
                zh: "感谢你的联系！我们会在 3 个工作日内回复。",
              })}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 card space-y-5">
            <div>
              <label className="label">{t({ en: "Organization Name", zh: "组织名称" })} *</label>
              <input className="input-field" value={form.organizationName} onChange={(e) => update("organizationName", e.target.value)} />
              {errors.organizationName && <p className="mt-1 text-xs text-red-500">{errors.organizationName}</p>}
            </div>
            <div>
              <label className="label">{t({ en: "Contact Name", zh: "联系人姓名" })} *</label>
              <input className="input-field" value={form.contactName} onChange={(e) => update("contactName", e.target.value)} />
              {errors.contactName && <p className="mt-1 text-xs text-red-500">{errors.contactName}</p>}
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="label">{t({ en: "Email", zh: "邮箱" })} *</label>
                <input type="email" className="input-field" value={form.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} />
                {errors.contactEmail && <p className="mt-1 text-xs text-red-500">{errors.contactEmail}</p>}
              </div>
              <div>
                <label className="label">{t({ en: "Phone (optional)", zh: "电话（选填）" })}</label>
                <input type="tel" className="input-field" value={form.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">{t({ en: "How would you like to partner?", zh: "你希望如何合作？" })} *</label>
              <textarea className="input-field" rows={4} value={form.message} onChange={(e) => update("message", e.target.value)} placeholder={t({ en: "Tell us about your organization and collaboration ideas...", zh: "请介绍你的组织和合作想法..." })} />
              {errors.message && <p className="mt-1 text-xs text-red-500">{errors.message}</p>}
            </div>
            <button type="submit" className="btn-primary w-full">
              {t({ en: "Submit Inquiry", zh: "提交咨询" })}
            </button>
          </form>
        )}

        <div className="mt-10 flex flex-col items-start gap-3 rounded-2xl border border-snow-100 bg-snow-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-snow-900">
              {t({ en: "Want to set up a booth?", zh: "想申请摊位吗？" })}
            </h3>
            <p className="mt-1 text-sm text-snow-700">
              {t({
                en: "Apply to be a merchant vendor at eligible SnowForce events.",
                zh: "申请成为 SnowForce 活动合作的线下商家。",
              })}
            </p>
          </div>
          <a href="/merchant" className="btn-primary shrink-0">
            {t({ en: "Go to Merchant Portal", zh: "进入商家入口" })}
          </a>
        </div>
      </div>
    </div>
  );
}
