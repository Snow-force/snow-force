"use client";

import { useFormState, useFormStatus } from "react-dom";

import {
  submitEventReviewAction,
  type ReviewFormState,
} from "@/lib/reviews/actions";
import { useLanguage } from "@/lib/language";
import type { EventReviewConfig, EventReviewQuestion } from "@/lib/types";

const initialState: ReviewFormState = { success: false };

export function EventReviewForm(props: {
  accessCode: string;
  config: EventReviewConfig;
}) {
  const [state, action] = useFormState(submitEventReviewAction, initialState);
  const { lang, t } = useLanguage();

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="accessCode" value={props.accessCode} />
      <input type="hidden" name="language" value={lang} />
      {state.message ? (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.message}
        </p>
      ) : null}

      {props.config.questions.map((question, index) => (
        <fieldset key={question.id} className="rounded-xl border border-gray-200 bg-white p-5">
          <legend className="px-1 text-base font-semibold text-gray-900">
            {index + 1}. {t(question.label)}
            {question.required ? <span className="ml-1 text-red-600">*</span> : null}
          </legend>
          {t(question.helpText) ? (
            <p className="mb-3 mt-1 text-sm text-gray-500">{t(question.helpText)}</p>
          ) : null}
          <QuestionInput question={question} lang={lang} />
          {state.errors?.[question.key] ? (
            <p className="mt-2 text-sm text-red-600">{state.errors[question.key]}</p>
          ) : null}
          {question.visibility === "internal" ? (
            <p className="mt-2 text-xs text-gray-400">
              {lang === "zh" ? "此回答仅供 SnowForce 团队内部查看。" : "Visible only to the SnowForce team."}
            </p>
          ) : null}
        </fieldset>
      ))}

      <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
        <input type="checkbox" name="consentToPublish" className="mt-1" />
        <span>
          {lang === "zh"
            ? "我同意 SnowForce 在审核后，以匿名方式在活动回顾中展示我标记为可公开的回答。"
            : "I allow SnowForce to publish my public-eligible answers anonymously after moderation."}
        </span>
      </label>

      <SubmitButton label={lang === "zh" ? "提交反馈" : "Submit review"} />
    </form>
  );
}

function QuestionInput(props: { question: EventReviewQuestion; lang: "en" | "zh" }) {
  const { question, lang } = props;
  const name = `answer:${question.key}`;
  if (question.type === "rating_5") {
    return (
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((rating) => (
          <label key={rating} className="cursor-pointer">
            <input className="peer sr-only" type="radio" name={name} value={rating} />
            <span className="flex min-h-12 items-center justify-center rounded-lg border border-gray-200 font-semibold text-gray-700 peer-checked:border-blue-600 peer-checked:bg-blue-50 peer-checked:text-blue-800">
              {rating}
            </span>
          </label>
        ))}
      </div>
    );
  }
  if (question.type === "yes_no") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {[
          { value: "true", label: lang === "zh" ? "是" : "Yes" },
          { value: "false", label: lang === "zh" ? "否" : "No" },
        ].map((option) => (
          <label key={option.value} className="flex items-center gap-2 rounded border border-gray-200 p-3">
            <input type="radio" name={name} value={option.value} />
            {option.label}
          </label>
        ))}
      </div>
    );
  }
  if (question.type === "single_choice" || question.type === "multiple_choice") {
    return (
      <div className="space-y-2">
        {question.options.en.map((canonicalValue, index) => (
          <label key={canonicalValue} className="flex items-center gap-2 rounded border border-gray-200 p-3 text-sm">
            <input
              type={question.type === "multiple_choice" ? "checkbox" : "radio"}
              name={name}
              value={canonicalValue}
            />
            {question.options[lang][index] || canonicalValue}
          </label>
        ))}
      </div>
    );
  }
  if (question.type === "long_text") {
    return (
      <textarea
        name={name}
        rows={5}
        minLength={question.minLength ?? undefined}
        maxLength={question.maxLength ?? undefined}
        className="w-full rounded-lg border border-gray-200 px-3 py-2"
      />
    );
  }
  return (
    <input
      name={name}
      minLength={question.minLength ?? undefined}
      maxLength={question.maxLength ?? undefined}
      className="w-full rounded-lg border border-gray-200 px-3 py-2"
    />
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="btn-primary w-full px-5 py-3 disabled:opacity-60">
      {pending ? "Submitting…" : label}
    </button>
  );
}
