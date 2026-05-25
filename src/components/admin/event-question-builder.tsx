"use client";

import { useState } from "react";

import type { EventQuestionType, EventRegistrationQuestion } from "@/lib/types";
import { useLanguage } from "@/lib/language";
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

function createQuestion(type: EventQuestionType): EventRegistrationQuestion {
  const key = normalizeQuestionKey(`${type}_${Date.now()}`);
  return {
    id: key,
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

  function updateQuestion(index: number, nextQuestion: EventRegistrationQuestion) {
    onChange(questions.map((question, questionIndex) => (questionIndex === index ? nextQuestion : question)));
  }

  function addQuestion() {
    onChange([...questions, createQuestion(newType)]);
  }

  function copyQuestion(index: number) {
    const source = questions[index];
    if (!source) return;
    const key = normalizeQuestionKey(`${source.type}_${Date.now()}`);
    onChange([...questions.slice(0, index + 1), { ...source, id: key, key }, ...questions.slice(index + 1)]);
  }

  function deleteQuestion(index: number) {
    onChange(questions.filter((_, questionIndex) => questionIndex !== index));
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= questions.length) return;
    const nextQuestions = [...questions];
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
        {questions.map((question, index) => {
          const isCollapsed = collapsedIds.has(question.id);
          return (
            <article key={question.id} className="rounded border border-gray-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{question.label[activeLang] || question.key}</p>
                  <p className="text-xs text-gray-500">{question.type.replaceAll("_", " ")} / {question.required ? "Required" : "Optional"}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={() => moveQuestion(index, -1)} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600">
                    {t(adminCopy.editor.moveUp)}
                  </button>
                  <button type="button" onClick={() => moveQuestion(index, 1)} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600">
                    {t(adminCopy.editor.moveDown)}
                  </button>
                  <button type="button" onClick={() => copyQuestion(index)} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600">
                    {t(adminCopy.editor.copy)}
                  </button>
                  <button type="button" onClick={() => deleteQuestion(index)} className="rounded border border-red-200 px-2 py-1 text-xs text-red-600">
                    Delete
                  </button>
                  <button type="button" onClick={() => toggleCollapsed(question.id)} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600">
                    {isCollapsed ? t(adminCopy.editor.expand) : t(adminCopy.editor.collapse)}
                  </button>
                </div>
              </div>

              {!isCollapsed ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="block text-sm text-gray-600">
                    Key
                    <input
                      value={question.key}
                      onChange={(changeEvent) => updateQuestion(index, { ...question, key: normalizeQuestionKey(changeEvent.currentTarget.value) })}
                      className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm text-gray-600">
                    Type
                    <select
                      value={question.type}
                      onChange={(changeEvent) => {
                        const selectedType = questionTypes.find((type) => type === changeEvent.currentTarget.value);
                        if (selectedType) updateQuestion(index, { ...question, type: selectedType });
                      }}
                      className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                    >
                      {questionTypes.map((type) => (
                        <option key={type} value={type}>
                          {type.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-gray-600">
                    Label
                    <input
                      value={question.label[activeLang]}
                      onChange={(changeEvent) => updateQuestion(index, {
                        ...question,
                        label: { ...question.label, [activeLang]: changeEvent.currentTarget.value },
                      })}
                      className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm text-gray-600">
                    Help text
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
                      onChange={(changeEvent) => updateQuestion(index, { ...question, required: changeEvent.currentTarget.checked })}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    Required
                  </label>
                  {isChoiceQuestion(question.type) ? (
                    <label className="block text-sm text-gray-600 md:col-span-2">
                      Options, one per line
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
