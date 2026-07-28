"use client";

import { useLanguage } from "@/lib/language";
import type { EventRecap } from "@/lib/types";
import { adminCopy } from "./admin-copy";

type RecapPublishStepProps = { recap: EventRecap; onChange(recap: EventRecap): void };

export function RecapPublishStep({ recap, onChange }: RecapPublishStepProps) {
  const { t } = useLanguage();
  const complete = Boolean(recap.title.en && recap.summary.en && recap.content.en && recap.location.en && recap.media.length > 0);
  return <section className="card space-y-4">
    <h3 className="text-base font-semibold text-gray-900">{t(adminCopy.editor.seoMedia)}</h3>
    <p className={complete ? "text-sm text-green-600" : "text-sm text-amber-600"}>{complete ? "English content and media are ready for publishing." : "Complete English title, summary, content, location, and at least one photo before publishing."}</p>
    <label className="block text-sm text-gray-600">{t(adminCopy.editor.seoTitleEn)}<input value={recap.seoTitle.en} onChange={(event) => onChange({ ...recap, seoTitle: { ...recap.seoTitle, en: event.currentTarget.value } })} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" /></label>
    <label className="block text-sm text-gray-600">{t(adminCopy.editor.seoDescriptionEn)}<textarea value={recap.seoDescription.en} onChange={(event) => onChange({ ...recap, seoDescription: { ...recap.seoDescription, en: event.currentTarget.value } })} rows={3} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" /></label>
  </section>;
}
