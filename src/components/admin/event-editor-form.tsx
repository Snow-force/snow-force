"use client";

import { useState } from "react";
import { useFormState } from "react-dom";

import { saveEventAction, type EventEditorState } from "@/lib/events/actions";
import { useLanguage } from "@/lib/language";
import type { Event } from "@/lib/types";
import { adminCopy } from "./admin-copy";
import { EventBasicStep } from "./event-basic-step";
import { EventDetailModuleBuilder } from "./event-detail-module-builder";
import { EventEditorStepper, type StepId } from "./event-editor-stepper";
import { EventMerchantBoothSettingsStep } from "./event-merchant-booth-settings-step";
import { EventPreviewPanel } from "./event-preview-panel";
import { EventQuestionBuilder } from "./event-question-builder";
import { EventRegistrationSettingsStep } from "./event-registration-settings-step";
import { EventReviewSettingsStep } from "./event-review-settings-step";
import { ensureRequiredRegistrationQuestions } from "@/lib/events/required-registration-questions";

const initialState: EventEditorState = { success: false };

type ActiveLang = "zh" | "en";

type BilingualEventKey = {
  [Key in keyof Event]: Event[Key] extends { en: string; zh: string } ? Key : never;
}[keyof Event];

function normalizeQuestionKey(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!normalized) return "field";
  return /^[a-z]/.test(normalized) ? normalized : `field_${normalized}`;
}

function uniqueQuestionKey(base: string, existingKeys: Set<string>) {
  const normalizedBase = normalizeQuestionKey(base);
  if (!existingKeys.has(normalizedBase)) return normalizedBase;

  let suffix = 2;
  let candidate = `${normalizedBase}_${suffix}`;
  while (existingKeys.has(candidate)) {
    suffix += 1;
    candidate = `${normalizedBase}_${suffix}`;
  }
  return candidate;
}

function eventPayload(event: Event) {
  const questionKeys = new Set<string>();

  return JSON.stringify({
    ...event,
    registrationQuestions: ensureRequiredRegistrationQuestions(event.registrationQuestions).map((question) => {
      const key = uniqueQuestionKey(question.key, questionKeys);
      questionKeys.add(key);
      return {
        ...question,
        key,
      };
    }),
  });
}

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.length ? <p className="mt-1 text-xs text-red-600">{errors[0]}</p> : null;
}

function friendlyFieldName(field: string) {
  const map: Record<string, string> = {
    slug: "链接标识 Slug",
    title: "活动标题",
    "title.zh": "活动标题（中文）",
    eventDate: "活动日期",
    meetTime: "集合时间",
    meetLocation: "集合地点",
    activityLocation: "活动地点",
    "activityLocation.zh": "活动地点（中文）",
    registrationCloseAt: "报名截止时间",
    capacity: "最大人数",
    registrationQuestions: "参与者问题",
    detailModules: "活动详情模块",
  };
  return map[field] ?? field;
}

function FieldErrorSummary({ fieldErrors }: { fieldErrors?: Record<string, string[] | undefined> }) {
  if (!fieldErrors) return null;
  const entries = Object.entries(fieldErrors).filter(([, errors]) => errors?.length);
  if (!entries.length) return null;

  return (
    <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        <p className="font-medium">Review these fields before saving:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {entries.map(([field, errors]) => (
          <li key={field}>{friendlyFieldName(field)}: {errors?.[0]}</li>
        ))}
        </ul>
      </div>
  );
}

export function EventEditorForm({ event, isNew }: { event: Event; isNew: boolean }) {
  const [formState, formAction] = useFormState(saveEventAction, initialState);
  const [draftEvent, setDraftEvent] = useState<Event>(event);
  const activeLang: ActiveLang = "en";
  const [activeStep, setActiveStep] = useState<StepId>("basic");
  const state = formState ?? initialState;
  const { lang, t } = useLanguage();
  const isZh = lang === "zh";

  function updateBilingualValue(key: BilingualEventKey, lang: ActiveLang, value: string) {
    setDraftEvent((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [lang]: value,
      },
    }));
  }

  const summaries: Record<StepId, string> = {
    basic: draftEvent.title[activeLang] || draftEvent.slug || (isZh ? "未命名" : "Untitled"),
    registration: isZh
      ? `${draftEvent.registrationState}，${draftEvent.capacity === 0 ? "不限名额" : `${draftEvent.capacity} 人`}`
      : `${draftEvent.registrationState}, ${draftEvent.capacity === 0 ? "unlimited" : draftEvent.capacity} spots`,
    merchants: draftEvent.merchantBoothProgram?.enabled
      ? isZh
        ? `已启用 · ${draftEvent.merchantBoothProgram.plans.length} 方案 · ${draftEvent.merchantBoothProgram.booths.length} 摊位`
        : `Enabled · ${draftEvent.merchantBoothProgram.plans.length} plan${draftEvent.merchantBoothProgram.plans.length === 1 ? "" : "s"} · ${draftEvent.merchantBoothProgram.booths.length} booth${draftEvent.merchantBoothProgram.booths.length === 1 ? "" : "s"}`
      : isZh
        ? "未启用"
        : "Disabled",
    questions: isZh
      ? `${draftEvent.registrationQuestions.length} 个问题`
      : `${draftEvent.registrationQuestions.length} question${draftEvent.registrationQuestions.length === 1 ? "" : "s"}`,
    review: isZh
      ? `${draftEvent.reviewConfig.questions.length} 个问题`
      : `${draftEvent.reviewConfig.questions.length} question${draftEvent.reviewConfig.questions.length === 1 ? "" : "s"}`,
    modules: isZh
      ? `${draftEvent.detailModules.length} 个模块`
      : `${draftEvent.detailModules.length} module${draftEvent.detailModules.length === 1 ? "" : "s"}`,
    preview: draftEvent.status,
  };

  return (
    <form action={formAction} className="space-y-5">
      {!isNew ? <input type="hidden" name="originalSlug" value={event.slug} /> : null}
      <input type="hidden" name="eventPayload" value={eventPayload(draftEvent)} />

      {state.message ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)_320px]">
        <div className="xl:sticky xl:top-4 xl:self-start">
          <EventEditorStepper activeStep={activeStep} onStepChange={setActiveStep} summaries={summaries} />
        </div>

        <div className="min-w-0">
          {activeStep === "basic" ? (
            <div className="space-y-2">
              <EventBasicStep event={draftEvent} activeLang={activeLang} onChange={setDraftEvent} isNew={isNew} />
              <FieldError errors={state.fieldErrors?.slug} />
              <FieldError errors={state.fieldErrors?.title} />
              <FieldError errors={state.fieldErrors?.eventDate} />
              <FieldError errors={state.fieldErrors?.meetTime} />
              <FieldError errors={state.fieldErrors?.activityLocation} />
            </div>
          ) : null}

          {activeStep === "registration" ? (
            <div className="space-y-2">
              <EventRegistrationSettingsStep event={draftEvent} activeLang={activeLang} onChange={setDraftEvent} />
              <FieldError errors={state.fieldErrors?.capacity} />
            </div>
          ) : null}

          {activeStep === "merchants" ? (
            <div className="space-y-2">
              <EventMerchantBoothSettingsStep event={draftEvent} activeLang={activeLang} onChange={setDraftEvent} />
              <FieldErrorSummary fieldErrors={state.fieldErrors} />
            </div>
          ) : null}

          {activeStep === "questions" ? (
            <div className="space-y-2">
              <EventQuestionBuilder
                questions={draftEvent.registrationQuestions}
                activeLang={activeLang}
                onChange={(registrationQuestions) => setDraftEvent((current) => ({ ...current, registrationQuestions }))}
              />
              <FieldError errors={state.fieldErrors?.registrationQuestions} />
            </div>
          ) : null}

          {activeStep === "review" ? (
            <div className="space-y-2">
              <EventReviewSettingsStep event={draftEvent} onChange={setDraftEvent} />
              <FieldError errors={state.fieldErrors?.reviewConfig} />
            </div>
          ) : null}

          {activeStep === "modules" ? (
            <div className="space-y-2">
              <EventDetailModuleBuilder
                modules={draftEvent.detailModules}
                activeLang={activeLang}
                onChange={(detailModules) => setDraftEvent((current) => ({ ...current, detailModules }))}
              />
              <FieldError errors={state.fieldErrors?.detailModules} />
            </div>
          ) : null}

          {activeStep === "preview" ? (
            <section className="card space-y-4">
              <h3 className="text-base font-semibold text-gray-900">SEO</h3>
              <div className="grid gap-4 md:grid-cols-2">
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
              <FieldErrorSummary fieldErrors={state.fieldErrors} />
            </section>
          ) : null}
        </div>

        <div className="space-y-3 xl:sticky xl:top-4 xl:self-start">
          <EventPreviewPanel event={draftEvent} activeLang={activeLang} />
          <button type="submit" className="btn-primary w-full px-5 py-2">
            {t(adminCopy.editor.save)}
          </button>
        </div>
      </div>
    </form>
  );
}
