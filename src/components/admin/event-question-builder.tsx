"use client";

import { useState } from "react";

import type { EventQuestionType, EventRegistrationQuestion } from "@/lib/types";
import { useLanguage } from "@/lib/language";
import { ensureRequiredRegistrationQuestions, isSystemRegistrationQuestion } from "@/lib/events/required-registration-questions";
import { adminCopy } from "./admin-copy";

type ActiveLang = "zh" | "en";

type EventQuestionBuilderProps = {
  questions: EventRegistrationQuestion[];
  activeLang: ActiveLang;
  onChange(questions: EventRegistrationQuestion[]): void;
};

const questionTypes: EventQuestionType[] = ["text", "single_choice", "multiple_choice", "yes_no", "date", "phone"];

function normalizeQuestionKey(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!normalized) return "field";
  return /^[a-z]/.test(normalized) ? normalized : `field_${normalized}`;
}

function uniqueValue(base: string, existingValues: Set<string>) {
  if (!existingValues.has(base)) return base;

  let suffix = 2;
  let candidate = `${base}_${suffix}`;
  while (existingValues.has(candidate)) {
    suffix += 1;
    candidate = `${base}_${suffix}`;
  }
  return candidate;
}

function uniqueQuestionKey(base: string, existingKeys: Set<string>) {
  return uniqueValue(normalizeQuestionKey(base), existingKeys);
}

function uniqueId(base: string, existingIds: Set<string>) {
  return uniqueValue(normalizeQuestionKey(base), existingIds);
}

function createQuestion(type: EventQuestionType, existingQuestions: EventRegistrationQuestion[]): EventRegistrationQuestion {
  const base = normalizeQuestionKey(`${type}_${Date.now()}`);
  const key = uniqueQuestionKey(base, new Set(existingQuestions.map((question) => question.key)));
  const id = uniqueId(base, new Set(existingQuestions.map((question) => question.id)));
  return {
    id,
    key,
    type,
    required: false,
    label: { en: "", zh: "" },
    helpText: { en: "", zh: "" },
    options: { en: [], zh: [] },
  };
}

function optionsToText(options: string[]) {
  return options.join("\n");
}

function textToOptions(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function isChoiceQuestion(type: EventQuestionType) {
  return type === "single_choice" || type === "multiple_choice";
}

export function EventQuestionBuilder({ questions, activeLang, onChange }: EventQuestionBuilderProps) {
  const { t } = useLanguage();
  const [newType, setNewType] = useState<EventQuestionType>("text");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const visibleQuestions = ensureRequiredRegistrationQuestions(questions);

  function updateQuestion(index: number, nextQuestion: EventRegistrationQuestion) {
    onChange(visibleQuestions.map((question, questionIndex) => (questionIndex === index ? nextQuestion : question)));
  }

  function addQuestion() {
    onChange([...visibleQuestions, createQuestion(newType, visibleQuestions)]);
  }

  function copyQuestion(index: number) {
    const source = visibleQuestions[index];
    if (!source) return;
    const existingIds = new Set(visibleQuestions.map((question) => question.id));
    const existingKeys = new Set(visibleQuestions.map((question) => question.key));
    const id = uniqueId(`${source.id}_copy`, existingIds);
    const key = uniqueQuestionKey(`${source.key}_copy`, existingKeys);
    onChange([...visibleQuestions.slice(0, index + 1), { ...source, id, key }, ...visibleQuestions.slice(index + 1)]);
  }

  function deleteQuestion(index: number) {
    onChange(visibleQuestions.filter((_, questionIndex) => questionIndex !== index));
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= visibleQuestions.length) return;
    const nextQuestions = [...visibleQuestions];
    const current = nextQuestions[index];
    const target = nextQuestions[nextIndex];
    if (!current || !target) return;
    nextQuestions[index] = target;
    nextQuestions[nextIndex] = current;
    onChange(nextQuestions);
  }

  function toggleCollapsed(id: string) {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">{t(adminCopy.editor.participantQuestions)}</h3>
        <div className="flex items-center gap-2">
          <select
            value={newType}
            onChange={(changeEvent) => {
              const selectedType = questionTypes.find((type) => type === changeEvent.currentTarget.value);
              if (selectedType) setNewType(selectedType);
            }}
            className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-700"
          >
            {questionTypes.map((type) => (
              <option key={type} value={type}>
                {type.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <button type="button" onClick={addQuestion} className="rounded border border-gray-200 px-3 py-1 text-sm text-gray-700">
            {t(adminCopy.editor.addQuestion)}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {visibleQuestions.map((question, index) => {
          const isCollapsed = collapsedIds.has(question.id);
          const isSystemQuestion = isSystemRegistrationQuestion(question.key);
          return (
            <article key={question.id} className="rounded border border-gray-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{question.label[activeLang] || question.key}</p>
                  <p className="text-xs text-gray-500">
                    {question.type.replaceAll("_", " ")} / {question.required ? t(adminCopy.editor.questionRequired) : t(adminCopy.editor.questionOptional)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" disabled={isSystemQuestion} onClick={() => moveQuestion(index, -1)} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 disabled:cursor-not-allowed disabled:opacity-40">
                    {t(adminCopy.editor.moveUp)}
                  </button>
                  <button type="button" disabled={isSystemQuestion} onClick={() => moveQuestion(index, 1)} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 disabled:cursor-not-allowed disabled:opacity-40">
                    {t(adminCopy.editor.moveDown)}
                  </button>
                  <button type="button" onClick={() => copyQuestion(index)} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600">
                    {t(adminCopy.editor.copy)}
                  </button>
                  <button type="button" disabled={isSystemQuestion} onClick={() => deleteQuestion(index)} className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 disabled:cursor-not-allowed disabled:opacity-40">
                    {t(adminCopy.editor.delete)}
                  </button>
                  <button type="button" onClick={() => toggleCollapsed(question.id)} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600">
                    {isCollapsed ? t(adminCopy.editor.expand) : t(adminCopy.editor.collapse)}
                  </button>
                </div>
              </div>

              {!isCollapsed ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="block text-sm text-gray-600">
                    {t(adminCopy.editor.questionKey)}
                    <input
                      value={question.key}
                      onChange={(changeEvent) => {
                        if (isSystemQuestion) return;
                        const otherKeys = new Set(
                          visibleQuestions
                            .filter((_, questionIndex) => questionIndex !== index)
                            .map((existingQuestion) => existingQuestion.key),
                        );
                        updateQuestion(index, { ...question, key: uniqueQuestionKey(changeEvent.currentTarget.value, otherKeys) });
                      }}
                      disabled={isSystemQuestion}
                      className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm text-gray-600">
                    {t(adminCopy.editor.questionType)}
                    <select
                      value={question.type}
                      onChange={(changeEvent) => {
                        if (isSystemQuestion) return;
                        const selectedType = questionTypes.find((type) => type === changeEvent.currentTarget.value);
                        if (selectedType) updateQuestion(index, { ...question, type: selectedType });
                      }}
                      disabled={isSystemQuestion}
                      className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                    >
                      {questionTypes.map((type) => (
                        <option key={type} value={type}>
                          {type.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-gray-600 md:col-span-2">
                    {t(activeLang === "zh" ? adminCopy.editor.questionLabelZh : adminCopy.editor.questionLabelEn)}
                    <input
                      value={question.label[activeLang]}
                      onChange={(changeEvent) => updateQuestion(index, {
                        ...question,
                        label: { ...question.label, [activeLang]: changeEvent.currentTarget.value },
                      })}
                      className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm text-gray-600 md:col-span-2">
                    {t(activeLang === "zh" ? adminCopy.editor.questionHelpZh : adminCopy.editor.questionHelpEn)}
                    <input
                      value={question.helpText[activeLang]}
                      onChange={(changeEvent) => updateQuestion(index, {
                        ...question,
                        helpText: { ...question.helpText, [activeLang]: changeEvent.currentTarget.value },
                      })}
                      className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-600 md:col-span-2">
                    <input
                      type="checkbox"
                      checked={question.required}
                      onChange={(changeEvent) => updateQuestion(index, { ...question, required: isSystemQuestion || changeEvent.currentTarget.checked })}
                      disabled={isSystemQuestion}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    {t(adminCopy.editor.questionRequired)}
                  </label>
                  {isChoiceQuestion(question.type) ? (
                    <label className="block text-sm text-gray-600 md:col-span-2">
                      {t(activeLang === "zh" ? adminCopy.editor.questionOptionsZh : adminCopy.editor.questionOptionsEn)}
                      <textarea
                        value={optionsToText(question.options[activeLang])}
                        onChange={(changeEvent) => updateQuestion(index, {
                          ...question,
                          options: { ...question.options, [activeLang]: textToOptions(changeEvent.currentTarget.value) },
                        })}
                        rows={4}
                        className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
