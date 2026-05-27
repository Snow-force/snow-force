"use client";

import { useLanguage } from "@/lib/language";
import type { EventRecap } from "@/lib/types";
import { adminCopy } from "./admin-copy";

type ActiveLang = "zh" | "en";

type RecapPublishStepProps = {
  recap: EventRecap;
  activeLang: ActiveLang;
  onLangChange(lang: ActiveLang): void;
  onChange(recap: EventRecap): void;
};

export function RecapPublishStep({ recap, activeLang, onLangChange, onChange }: RecapPublishStepProps) {
  const { t } = useLanguage();
  const complete = Boolean(recap.title.zh && recap.summary.zh && recap.content.zh && recap.location.zh && recap.media.length > 0);

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">{t(adminCopy.editor.seoMedia)}</h3>
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
      <p className={complete ? "text-sm text-green-600" : "text-sm text-amber-600"}>
        {complete
          ? t({ en: "Chinese content and media are ready for publishing.", zh: "中文内容和照片已满足发布要求。" })
          : t({
              en: "Complete Chinese title, summary, content, location, and at least one photo before publishing.",
              zh: "发布前请补全中文标题、摘要、正文、地点，并至少上传一张照片。",
            })}
      </p>
      <label className="block text-sm text-gray-600">
        {activeLang === "zh" ? t(adminCopy.editor.seoTitleZh) : t(adminCopy.editor.seoTitleEn)}
        <input
          value={recap.seoTitle[activeLang]}
          onChange={(event) => onChange({ ...recap, seoTitle: { ...recap.seoTitle, [activeLang]: event.currentTarget.value } })}
          className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
        />
      </label>
      <label className="block text-sm text-gray-600">
        {activeLang === "zh" ? t(adminCopy.editor.seoDescriptionZh) : t(adminCopy.editor.seoDescriptionEn)}
        <textarea
          value={recap.seoDescription[activeLang]}
          onChange={(event) => onChange({ ...recap, seoDescription: { ...recap.seoDescription, [activeLang]: event.currentTarget.value } })}
          rows={3}
          className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
        />
      </label>
    </section>
  );
}
