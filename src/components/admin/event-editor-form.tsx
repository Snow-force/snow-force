"use client";

import { useState } from "react";
import { useFormState } from "react-dom";

import { saveEventAction, type EventEditorState } from "@/lib/events/actions";
import { useLanguage } from "@/lib/language";
import type { Event, EventDetailModule, EventRegistrationQuestion } from "@/lib/types";
import { adminCopy } from "./admin-copy";

const initialState: EventEditorState = { success: false };

type ActiveLang = "zh" | "en";
type BilingualEventKey = {
  [Key in keyof Event]: Event[Key] extends { en: string; zh: string } ? Key : never;
}[keyof Event];
type JsonErrors = { questions?: string; modules?: string };

function localDateTime(value: string) {
  return value ? value.slice(0, 16) : "";
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBilingualText(value: unknown): value is Event["title"] {
  return isRecord(value) && typeof value.en === "string" && typeof value.zh === "string";
}

function isBilingualList(value: unknown): value is EventRegistrationQuestion["options"] {
  return (
    isRecord(value) &&
    Array.isArray(value.en) &&
    Array.isArray(value.zh) &&
    value.en.every((item) => typeof item === "string") &&
    value.zh.every((item) => typeof item === "string")
  );
}

function isQuestionType(value: unknown): value is EventRegistrationQuestion["type"] {
  return (
    value === "text" ||
    value === "single_choice" ||
    value === "multiple_choice" ||
    value === "yes_no" ||
    value === "date" ||
    value === "phone"
  );
}

function isModuleType(value: unknown): value is EventDetailModule["type"] {
  return (
    value === "intro" ||
    value === "highlights" ||
    value === "itinerary" ||
    value === "notes" ||
    value === "fees" ||
    value === "refund" ||
    value === "contact" ||
    value === "custom"
  );
}

function isDisplayMode(value: unknown): value is EventDetailModule["displayMode"] {
  return value === "rich_text" || value === "list";
}

function isRegistrationQuestion(value: unknown): value is EventRegistrationQuestion {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.key === "string" &&
    isQuestionType(value.type) &&
    typeof value.required === "boolean" &&
    isBilingualText(value.label) &&
    isBilingualText(value.helpText) &&
    isBilingualList(value.options)
  );
}

function isDetailModule(value: unknown): value is EventDetailModule {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isModuleType(value.type) &&
    isDisplayMode(value.displayMode) &&
    isBilingualText(value.title) &&
    isBilingualText(value.content) &&
    isBilingualList(value.items)
  );
}

function parseJsonArray<T>(value: string, isItem: (item: unknown) => item is T) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every(isItem) ? parsed : null;
  } catch {
    return null;
  }
}

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.length ? <p className="mt-1 text-xs text-red-600">{errors[0]}</p> : null;
}

export function EventEditorForm({ event, isNew }: { event: Event; isNew: boolean }) {
  const [formState, formAction] = useFormState(saveEventAction, initialState);
  const [draftEvent, setDraftEvent] = useState<Event>(event);
  const [activeLang, setActiveLang] = useState<ActiveLang>("zh");
  const [questionsJson, setQuestionsJson] = useState(prettyJson(event.registrationQuestions));
  const [modulesJson, setModulesJson] = useState(prettyJson(event.detailModules));
  const [jsonErrors, setJsonErrors] = useState<JsonErrors>({});
  const state = formState ?? initialState;
  const { t } = useLanguage();
  const hasJsonErrors = Boolean(jsonErrors.questions || jsonErrors.modules);

  function updateEventValue<Key extends keyof Event>(key: Key, value: Event[Key]) {
    setDraftEvent((current) => ({ ...current, [key]: value }));
  }

  function updateBilingualValue(key: BilingualEventKey, lang: ActiveLang, value: string) {
    setDraftEvent((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [lang]: value,
      },
    }));
  }

  function syncQuestionsJson(value: string) {
    setQuestionsJson(value);
    const parsed = parseJsonArray(value, isRegistrationQuestion);
    if (!parsed) {
      setJsonErrors((current) => ({ ...current, questions: t(adminCopy.editor.invalidJson) }));
      return;
    }
    setJsonErrors((current) => ({ ...current, questions: undefined }));
    updateEventValue("registrationQuestions", parsed);
  }

  function syncModulesJson(value: string) {
    setModulesJson(value);
    const parsed = parseJsonArray(value, isDetailModule);
    if (!parsed) {
      setJsonErrors((current) => ({ ...current, modules: t(adminCopy.editor.invalidJson) }));
      return;
    }
    setJsonErrors((current) => ({ ...current, modules: undefined }));
    updateEventValue("detailModules", parsed);
  }

  return (
    <form action={formAction} className="space-y-8">
      {!isNew ? <input type="hidden" name="originalSlug" value={event.slug} /> : null}
      <input type="hidden" name="eventPayload" value={JSON.stringify(draftEvent)} />

      {state.message ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {(["zh", "en"] as const).map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => setActiveLang(lang)}
            className={`rounded border px-3 py-1 text-sm font-medium ${
              activeLang === lang
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            {lang === "zh" ? "中文" : "English"}
          </button>
        ))}
      </div>

      <section className="card space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">{t(adminCopy.editor.basicInfo)}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.slug)}
            <input
              value={draftEvent.slug}
              onChange={(changeEvent) => updateEventValue("slug", changeEvent.currentTarget.value)}
              readOnly={!isNew}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2 read-only:bg-gray-50"
            />
            <FieldError errors={state.fieldErrors?.slug} />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.title)}
            <input
              value={draftEvent.title[activeLang]}
              onChange={(changeEvent) => updateBilingualValue("title", activeLang, changeEvent.currentTarget.value)}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
            />
            <FieldError errors={state.fieldErrors?.title} />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.eventStart)}
            <input
              type="date"
              value={draftEvent.eventDate}
              onChange={(changeEvent) => updateEventValue("eventDate", changeEvent.currentTarget.value)}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
            />
            <FieldError errors={state.fieldErrors?.eventDate} />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.schedule)}
            <input
              value={draftEvent.meetTime}
              onChange={(changeEvent) => updateEventValue("meetTime", changeEvent.currentTarget.value)}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
            />
            <FieldError errors={state.fieldErrors?.meetTime} />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.meetLocation)}
            <input
              value={draftEvent.meetLocation[activeLang]}
              onChange={(changeEvent) => updateBilingualValue("meetLocation", activeLang, changeEvent.currentTarget.value)}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.activityLocation)}
            <input
              value={draftEvent.activityLocation[activeLang]}
              onChange={(changeEvent) => updateBilingualValue("activityLocation", activeLang, changeEvent.currentTarget.value)}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
            />
            <FieldError errors={state.fieldErrors?.activityLocation} />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.mapUrl)}
            <input
              value={draftEvent.locationUrl}
              onChange={(changeEvent) => updateEventValue("locationUrl", changeEvent.currentTarget.value)}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.coverImage)}
            <input
              value={draftEvent.coverImage}
              onChange={(changeEvent) => updateEventValue("coverImage", changeEvent.currentTarget.value)}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
            />
          </label>
        </div>
      </section>

      <section className="card space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">{t(adminCopy.editor.registrationSettings)}</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.capacity)}
            <input
              type="number"
              min={0}
              value={draftEvent.capacity}
              onChange={(changeEvent) => updateEventValue("capacity", Number(changeEvent.currentTarget.value))}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
            />
            <FieldError errors={state.fieldErrors?.capacity} />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.registrationClose)}
            <input
              type="datetime-local"
              value={localDateTime(draftEvent.registrationCloseAt)}
              onChange={(changeEvent) => updateEventValue("registrationCloseAt", changeEvent.currentTarget.value)}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.state)}
            <select
              value={draftEvent.registrationState}
              onChange={(changeEvent) => updateEventValue("registrationState", changeEvent.currentTarget.value as Event["registrationState"])}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
            >
              <option value="closed">{t(adminCopy.editor.closed)}</option>
              <option value="open">{t(adminCopy.editor.open)}</option>
              <option value="full">{t(adminCopy.editor.full)}</option>
            </select>
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={draftEvent.requiresApproval}
              onChange={(changeEvent) => updateEventValue("requiresApproval", changeEvent.currentTarget.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Requires approval
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={draftEvent.allowWaitlist}
              onChange={(changeEvent) => updateEventValue("allowWaitlist", changeEvent.currentTarget.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Allow waitlist
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={draftEvent.allowCancellation}
              onChange={(changeEvent) => updateEventValue("allowCancellation", changeEvent.currentTarget.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Allow cancellation
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.feeInfo)}
            <input
              value={draftEvent.feeAmount}
              onChange={(changeEvent) => updateEventValue("feeAmount", changeEvent.currentTarget.value)}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm text-gray-600">
            Payment instructions
            <textarea
              value={draftEvent.paymentInstructions[activeLang]}
              onChange={(changeEvent) => updateBilingualValue("paymentInstructions", activeLang, changeEvent.currentTarget.value)}
              rows={3}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
            />
          </label>
        </div>
      </section>

      <section className="card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-900">{t(adminCopy.editor.participantQuestions)}</h3>
          <button type="button" className="rounded border border-gray-200 px-3 py-1 text-sm text-gray-700">
            {t(adminCopy.editor.addQuestion)}
          </button>
        </div>
        <textarea
          value={questionsJson}
          onChange={(changeEvent) => syncQuestionsJson(changeEvent.currentTarget.value)}
          rows={10}
          className="w-full rounded border border-gray-200 px-3 py-2 font-mono text-xs"
        />
        {jsonErrors.questions ? <p className="text-xs text-red-600">{jsonErrors.questions}</p> : null}
        <FieldError errors={state.fieldErrors?.registrationQuestions} />
      </section>

      <section className="card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-900">{t(adminCopy.editor.eventDetailModules)}</h3>
          <button type="button" className="rounded border border-gray-200 px-3 py-1 text-sm text-gray-700">
            {t(adminCopy.editor.addModule)}
          </button>
        </div>
        <textarea
          value={modulesJson}
          onChange={(changeEvent) => syncModulesJson(changeEvent.currentTarget.value)}
          rows={12}
          className="w-full rounded border border-gray-200 px-3 py-2 font-mono text-xs"
        />
        {jsonErrors.modules ? <p className="text-xs text-red-600">{jsonErrors.modules}</p> : null}
        <FieldError errors={state.fieldErrors?.detailModules} />
      </section>

      <section className="card space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">{t(adminCopy.editor.previewAndPublish)}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.status)}
            <select
              value={draftEvent.status}
              onChange={(changeEvent) => updateEventValue("status", changeEvent.currentTarget.value as Event["status"])}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
            >
              <option value="draft">{t(adminCopy.events.statuses.draft)}</option>
              <option value="published">{t(adminCopy.events.statuses.published)}</option>
              <option value="archived">{t(adminCopy.events.statuses.archived)}</option>
            </select>
          </label>
          <label className="block text-sm text-gray-600">
            {t(adminCopy.editor.seoTitleEn)}
            <input
              value={draftEvent.seoTitle[activeLang]}
              onChange={(changeEvent) => updateBilingualValue("seoTitle", activeLang, changeEvent.currentTarget.value)}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm text-gray-600 md:col-span-2">
            {t(adminCopy.editor.seoDescriptionEn)}
            <textarea
              value={draftEvent.seoDescription[activeLang]}
              onChange={(changeEvent) => updateBilingualValue("seoDescription", activeLang, changeEvent.currentTarget.value)}
              rows={3}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
            />
          </label>
        </div>
      </section>

      <button type="submit" disabled={hasJsonErrors} className="btn-primary px-5 py-2 disabled:cursor-not-allowed disabled:opacity-50">
        {t(adminCopy.editor.save)}
      </button>
    </form>
  );
}
