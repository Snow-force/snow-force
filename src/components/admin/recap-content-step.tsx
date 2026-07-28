"use client";

import { useLanguage } from "@/lib/language";
import type { EventRecap } from "@/lib/types";
import { adminCopy } from "./admin-copy";

type RecapContentStepProps = {
  recap: EventRecap;
  onChange(recap: EventRecap): void;
};

function updateList(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export function RecapContentStep({ recap, onChange }: RecapContentStepProps) {
  const { t } = useLanguage();
  return <section className="card space-y-4">
    <h3 className="text-base font-semibold text-gray-900">{t(adminCopy.recapEditor.recapContent)}</h3>
    <label className="block text-sm text-gray-600">{t(adminCopy.editor.title)}<input value={recap.title.en} onChange={(event) => onChange({ ...recap, title: { ...recap.title, en: event.currentTarget.value } })} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" /></label>
    <label className="block text-sm text-gray-600">{t(adminCopy.recapEditor.summary)}<textarea value={recap.summary.en} onChange={(event) => onChange({ ...recap, summary: { ...recap.summary, en: event.currentTarget.value } })} rows={3} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" /></label>
    <label className="block text-sm text-gray-600">{t(adminCopy.recapEditor.content)}<textarea value={recap.content.en} onChange={(event) => onChange({ ...recap, content: { ...recap.content, en: event.currentTarget.value } })} rows={8} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" /></label>
    <label className="block text-sm text-gray-600">Location<input value={recap.location.en} onChange={(event) => onChange({ ...recap, location: { ...recap.location, en: event.currentTarget.value } })} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" /></label>
    <label className="block text-sm text-gray-600">{t(adminCopy.editor.tags)}<textarea value={recap.tags.en.join("\n")} onChange={(event) => onChange({ ...recap, tags: { ...recap.tags, en: updateList(event.currentTarget.value) } })} rows={3} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" /></label>
  </section>;
}
