"use client";

import { useLanguage } from "@/lib/language";
import type { EventRecap } from "@/lib/types";
import { adminCopy } from "./admin-copy";

type ActiveLang = "zh" | "en";

type RecapContentStepProps = {
  recap: EventRecap;
  activeLang: ActiveLang;
  onLangChange(lang: ActiveLang): void;
  onChange(recap: EventRecap): void;
};

function updateList(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function RecapContentStep({ recap, activeLang, onLangChange, onChange }: RecapContentStepProps) {
  const { t } = useLanguage();
  const languageLabel = activeLang === "zh" ? "中文" : "English";

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">{t(adminCopy.recapEditor.recapContent)}</h3>
        <div className="flex gap-2">
          {(["zh", "en"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onLangChange(option)}
              className={`rounded border px-3 py-1 text-sm font-medium ${
                activeLang === option
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              }`}
            >
              {option === "zh" ? "中文" : "English"}
            </button>
          ))}
        </div>
      </div>
      {activeLang === "en" ? (
        <p className="rounded border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          {t(adminCopy.recapEditor.englishOptional)}
        </p>
      ) : null}
      <label className="block text-sm text-gray-600">
        {t(adminCopy.editor.title)} · {languageLabel}
        <input
          value={recap.title[activeLang]}
          onChange={(event) => onChange({ ...recap, title: { ...recap.title, [activeLang]: event.currentTarget.value } })}
          className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
        />
      </label>
      <label className="block text-sm text-gray-600">
        {t(adminCopy.recapEditor.summary)} · {languageLabel}
        <textarea
          value={recap.summary[activeLang]}
          onChange={(event) => onChange({ ...recap, summary: { ...recap.summary, [activeLang]: event.currentTarget.value } })}
          rows={3}
          className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
        />
      </label>
      <label className="block text-sm text-gray-600">
        {t(adminCopy.recapEditor.content)} · {languageLabel}
        <textarea
          value={recap.content[activeLang]}
          onChange={(event) => onChange({ ...recap, content: { ...recap.content, [activeLang]: event.currentTarget.value } })}
          rows={8}
          className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
        />
      </label>
      <label className="block text-sm text-gray-600">
        {t(adminCopy.editor.locationZh)} · {languageLabel}
        <input
          value={recap.location[activeLang]}
          onChange={(event) => onChange({ ...recap, location: { ...recap.location, [activeLang]: event.currentTarget.value } })}
          className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
        />
      </label>
      <label className="block text-sm text-gray-600">
        {t(adminCopy.editor.tags)} · {languageLabel}
        <textarea
          value={recap.tags[activeLang].join("\n")}
          onChange={(event) => onChange({ ...recap, tags: { ...recap.tags, [activeLang]: updateList(event.currentTarget.value) } })}
          rows={3}
          className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
        />
      </label>
    </section>
  );
}
