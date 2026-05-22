"use client";

import { useFormState } from "react-dom";

import { saveEventAction, type EventEditorState } from "@/lib/events/actions";
import { useLanguage } from "@/lib/language";
import type { Event } from "@/lib/types";
import { adminCopy } from "./admin-copy";

const initialState: EventEditorState = { success: false };

function lines(items: string[]) {
  return items.join("\n");
}

function localDateTime(value: string) {
  return value ? value.slice(0, 16) : "";
}

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.length ? <p className="mt-1 text-xs text-red-600">{errors[0]}</p> : null;
}

function ContentFields({
  event,
  lang,
  labels,
}: {
  event: Event;
  lang: "en" | "zh";
  labels: {
    title: string;
    fieldTitle: string;
    subtitle: string;
    description: string;
    highlights: string;
    notices: string;
    audienceLevel: string;
    feeInfo: string;
    schedule: string;
    tags: string;
  };
}) {
  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">{labels.title}</h3>
      <label className="block text-sm text-gray-600">
        {labels.fieldTitle}
        <input name={`title.${lang}`} defaultValue={event.title[lang]} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
      </label>
      <label className="block text-sm text-gray-600">
        {labels.subtitle}
        <input name={`subtitle.${lang}`} defaultValue={event.subtitle[lang]} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
      </label>
      <label className="block text-sm text-gray-600">
        {labels.description}
        <textarea name={`description.${lang}`} defaultValue={event.description[lang]} rows={5} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-gray-600">
          {labels.highlights}
          <textarea name={`highlights.${lang}`} defaultValue={lines(event.highlights[lang])} rows={4} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
        </label>
        <label className="block text-sm text-gray-600">
          {labels.notices}
          <textarea name={`notices.${lang}`} defaultValue={lines(event.notices[lang])} rows={4} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-gray-600">
          {labels.audienceLevel}
          <input name={`audienceLevel.${lang}`} defaultValue={event.audienceLevel[lang]} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
        </label>
        <label className="block text-sm text-gray-600">
          {labels.feeInfo}
          <input name={`feeInfo.${lang}`} defaultValue={event.feeInfo[lang]} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
        </label>
      </div>
      <label className="block text-sm text-gray-600">
        {labels.schedule}
        <textarea name={`schedule.${lang}`} defaultValue={event.schedule[lang]} rows={4} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
      </label>
      <label className="block text-sm text-gray-600">
        {labels.tags}
        <textarea name={`tags.${lang}`} defaultValue={lines(event.tags[lang])} rows={3} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
      </label>
    </section>
  );
}

export function EventEditorForm({ event, isNew }: { event: Event; isNew: boolean }) {
  const [state, formAction] = useFormState(saveEventAction, initialState);
  const { t } = useLanguage();
  const contentLabels = {
    fieldTitle: t(adminCopy.editor.title),
    subtitle: t(adminCopy.editor.subtitle),
    description: t(adminCopy.editor.description),
    highlights: t(adminCopy.editor.highlights),
    notices: t(adminCopy.editor.notices),
    audienceLevel: t(adminCopy.editor.audienceLevel),
    feeInfo: t(adminCopy.editor.feeInfo),
    schedule: t(adminCopy.editor.schedule),
    tags: t(adminCopy.editor.tags),
  };

  return (
    <form action={formAction} className="space-y-8">
      {!isNew ? <input type="hidden" name="originalSlug" value={event.slug} /> : null}
      <input type="hidden" name="registrationCount" value={event.registrationCount} />
      <input type="hidden" name="status" value={event.status} />
      {state.message ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      ) : null}

      <section className="card space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">{t(adminCopy.editor.basic)}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.slug)}
            <input name="slug" defaultValue={event.slug} readOnly={!isNew} className="mt-1 w-full rounded border border-gray-200 px-3 py-2 read-only:bg-gray-50" />
            <FieldError errors={state.fieldErrors?.slug} />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.capacity)}
            <input name="capacity" type="number" min={0} defaultValue={event.capacity} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
            <FieldError errors={state.fieldErrors?.capacity} />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.locationEn)}
            <input name="location.en" defaultValue={event.location.en} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.locationZh)}
            <input name="location.zh" defaultValue={event.location.zh} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.mapUrl)}
            <input name="locationUrl" defaultValue={event.locationUrl} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.coverImage)}
            <input name="coverImage" defaultValue={event.coverImage} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.eventStart)}
            <input name="eventStartAt" type="datetime-local" defaultValue={localDateTime(event.eventStartAt)} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.eventEnd)}
            <input name="eventEndAt" type="datetime-local" defaultValue={localDateTime(event.eventEndAt)} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
          </label>
        </div>
      </section>

      <section className="card grid gap-8 xl:grid-cols-2">
        <ContentFields event={event} lang="en" labels={{ ...contentLabels, title: t(adminCopy.editor.englishContent) }} />
        <ContentFields event={event} lang="zh" labels={{ ...contentLabels, title: t(adminCopy.editor.chineseContent) }} />
      </section>

      <section className="card space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">{t(adminCopy.editor.registration)}</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.state)}
            <select name="registrationState" defaultValue={event.registrationState} className="mt-1 w-full rounded border border-gray-200 px-3 py-2">
              <option value="closed">{t(adminCopy.editor.closed)}</option>
              <option value="open">{t(adminCopy.editor.open)}</option>
              <option value="full">{t(adminCopy.editor.full)}</option>
            </select>
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.registrationOpen)}
            <input name="registrationOpenAt" type="datetime-local" defaultValue={localDateTime(event.registrationOpenAt)} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.registrationClose)}
            <input name="registrationCloseAt" type="datetime-local" defaultValue={localDateTime(event.registrationCloseAt)} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
          </label>
        </div>
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.registrationFields)}
          <textarea name="registrationFields" defaultValue={JSON.stringify(event.registrationFields, null, 2)} rows={10} className="mt-1 w-full rounded border border-gray-200 px-3 py-2 font-mono text-xs" />
        </label>
      </section>

      <section className="card space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">{t(adminCopy.editor.seoMedia)}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.seoTitleEn)}
            <input name="seoTitle.en" defaultValue={event.seoTitle.en} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.seoTitleZh)}
            <input name="seoTitle.zh" defaultValue={event.seoTitle.zh} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.seoDescriptionEn)}
            <textarea name="seoDescription.en" defaultValue={event.seoDescription.en} rows={3} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.seoDescriptionZh)}
            <textarea name="seoDescription.zh" defaultValue={event.seoDescription.zh} rows={3} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
          </label>
        </div>
        <label className="block text-sm text-gray-600">
          {t(adminCopy.editor.media)}
          <textarea name="media" defaultValue={lines(event.media)} rows={3} className="mt-1 w-full rounded border border-gray-200 px-3 py-2" />
        </label>
      </section>

      <button className="btn-primary px-5 py-2">{t(adminCopy.editor.save)}</button>
    </form>
  );
}
