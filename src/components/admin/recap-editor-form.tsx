"use client";

import { useLanguage } from "@/lib/language";
import { updateRecapAction } from "@/lib/recaps/actions";
import type { EventRecap } from "@/lib/types";
import { adminCopy } from "./admin-copy";

function lines(items: string[]) {
  return items.join("\n");
}

function mediaUrls(media: EventRecap["media"]) {
  return media.map((m) => m.url).join("\n");
}

function mediaCaptions(media: EventRecap["media"], lang: "en" | "zh") {
  return media.map((m) => m.caption[lang]).join("\n");
}

function ContentFields({
  recap,
  lang,
  labels,
}: {
  recap: EventRecap;
  lang: "en" | "zh";
  labels: {
    sectionTitle: string;
    title: string;
    summary: string;
    content: string;
    tags: string;
  };
}) {
  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">{labels.sectionTitle}</h3>
      <label className="block text-sm text-gray-600">
        {labels.title}
        <input name={`title.${lang}`} defaultValue={recap.title[lang]} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
      </label>
      <label className="block text-sm text-gray-600">
        {labels.summary}
        <textarea name={`summary.${lang}`} defaultValue={recap.summary[lang]} rows={3} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
      </label>
      <label className="block text-sm text-gray-600">
        {labels.content}
        <textarea name={`content.${lang}`} defaultValue={recap.content[lang]} rows={8} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
      </label>
      <label className="block text-sm text-gray-600">
        {labels.tags}
        <textarea name={`tags.${lang}`} defaultValue={lines(recap.tags[lang])} rows={3} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
      </label>
    </section>
  );
}

export function RecapEditorForm({ recap }: { recap: EventRecap }) {
  const { t } = useLanguage();
  const contentLabels = {
    title: t(adminCopy.editor.title),
    summary: t(adminCopy.recapEditor.summary),
    content: t(adminCopy.recapEditor.content),
    tags: t(adminCopy.editor.tags),
  };

  return (
    <form action={updateRecapAction} className="space-y-8">
      <input type="hidden" name="slug" value={recap.slug} />
      <input type="hidden" name="status" value={recap.status} />

      {recap.eventSlug ? (
        <div className="rounded border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          <span className="font-medium">{t({ en: "Source event:", zh: "来源活动：" })}</span>{" "}
          <span className="font-mono text-indigo-600">{recap.eventSlug}</span>
          <span className="ml-2 text-indigo-500">
            {t({
              en: "— Add photos and publish to show this recap on the recaps page.",
              zh: "— 添加照片并发布后，将在往期回顾页面展示。",
            })}
          </span>
        </div>
      ) : null}

      <section className="card space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">{t(adminCopy.editor.basic)}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.slug)}
            <input name="slugDisplay" value={recap.slug} readOnly className="mt-1 w-full rounded border border-gray-200 bg-gray-50 px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.recapEditor.date)}
            <input name="date" type="date" defaultValue={recap.date} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.locationEn)}
            <input name="location.en" defaultValue={recap.location.en} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.locationZh)}
            <input name="location.zh" defaultValue={recap.location.zh} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-600 md:col-span-2">
            {t(adminCopy.editor.coverImage)}
            <input name="coverImage" defaultValue={recap.coverImage} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
          </label>
        </div>
      </section>

      <section className="card grid gap-8 xl:grid-cols-2">
        <ContentFields recap={recap} lang="en" labels={{ ...contentLabels, sectionTitle: t(adminCopy.editor.englishContent) }} />
        <ContentFields recap={recap} lang="zh" labels={{ ...contentLabels, sectionTitle: t(adminCopy.editor.chineseContent) }} />
      </section>

      <section className="card space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">{t(adminCopy.recapEditor.media)}</h3>
        <p className="text-sm text-gray-400">{t(adminCopy.recapEditor.mediaHelp)}</p>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block text-sm text-gray-600">
            {t(adminCopy.recapEditor.mediaUrls)}
            <textarea name="mediaUrls" defaultValue={mediaUrls(recap.media)} rows={5} className="mt-1 w-full rounded border border-gray-200 px-3 py-2 font-mono text-xs" />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.recapEditor.mediaCaptionsEn)}
            <textarea name="mediaCaptions.en" defaultValue={mediaCaptions(recap.media, "en")} rows={5} className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-xs" />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.recapEditor.mediaCaptionsZh)}
            <textarea name="mediaCaptions.zh" defaultValue={mediaCaptions(recap.media, "zh")} rows={5} className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-xs" />
          </label>
        </div>
      </section>

      <section className="card space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">{t(adminCopy.editor.seoMedia)}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.seoTitleEn)}
            <input name="seoTitle.en" defaultValue={recap.seoTitle.en} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.seoTitleZh)}
            <input name="seoTitle.zh" defaultValue={recap.seoTitle.zh} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.seoDescriptionEn)}
            <textarea name="seoDescription.en" defaultValue={recap.seoDescription.en} rows={3} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.seoDescriptionZh)}
            <textarea name="seoDescription.zh" defaultValue={recap.seoDescription.zh} rows={3} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
          </label>
        </div>
      </section>

      <button className="btn-primary px-5 py-2">{t(adminCopy.editor.save)}</button>
    </form>
  );
}
