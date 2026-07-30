"use client";

import { createDefaultReviewConfig } from "@/lib/reviews/config";
import type { Event, EventReviewQuestion, ReviewQuestionType } from "@/lib/types";

type Props = { event: Event; onChange(event: Event): void };

const questionTypes: Array<{ value: ReviewQuestionType; label: string }> = [
  { value: "rating_5", label: "1–5 rating" },
  { value: "single_choice", label: "Single choice" },
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "yes_no", label: "Yes / no" },
  { value: "short_text", label: "Short text" },
  { value: "long_text", label: "Long text" },
];
const lockedKeys = new Set(["overall_rating", "improvement"]);

function makeQuestion(index: number): EventReviewQuestion {
  return {
    id: crypto.randomUUID(),
    key: `custom_question_${index}`,
    type: "long_text",
    required: false,
    visibility: "internal",
    label: { en: "New review question", zh: "" },
    helpText: { en: "", zh: "" },
    options: { en: [], zh: [] },
    minLength: null,
    maxLength: 600,
    maxSelections: null,
  };
}

export function EventReviewSettingsStep({ event, onChange }: Props) {
  const config = event.reviewConfig;
  const updateConfig = (reviewConfig: Event["reviewConfig"]) => onChange({ ...event, reviewConfig });
  const updateQuestion = (id: string, patch: Partial<EventReviewQuestion>) =>
    updateConfig({
      ...config,
      questions: config.questions.map((question) =>
        question.id === id ? { ...question, ...patch } : question,
      ),
    });

  function moveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= config.questions.length) return;
    const questions = [...config.questions];
    [questions[index], questions[target]] = [questions[target], questions[index]];
    updateConfig({ ...config, questions });
  }

  return (
    <section className="space-y-5">
      <div className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Post-event review</h3>
            <p className="mt-1 text-sm text-gray-600">
              Opening the Review QR freezes these settings for that event.
            </p>
          </div>
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
            onClick={() => updateConfig(createDefaultReviewConfig())}
          >
            Reset to default
          </button>
        </div>
        <p className="rounded bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">
          Overall rating and improvement feedback are required core questions. An optional gift
          rewards thoughtful participation, never a particular score.
        </p>
      </div>

      <div className="space-y-3">
        {config.questions.map((question, index) => {
          const locked = lockedKeys.has(question.key);
          const choiceType =
            question.type === "single_choice" || question.type === "multiple_choice";
          return (
            <article key={question.id} className="card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Question {index + 1}
                  {locked ? (
                    <span className="ml-2 rounded bg-gray-100 px-2 py-1 normal-case text-gray-600">
                      Core
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-3">
                  <button type="button" className="text-sm text-gray-600" onClick={() => moveQuestion(index, -1)}>Up</button>
                  <button type="button" className="text-sm text-gray-600" onClick={() => moveQuestion(index, 1)}>Down</button>
                  {!locked ? (
                    <button
                      type="button"
                      className="text-sm text-red-600"
                      onClick={() =>
                        updateConfig({
                          ...config,
                          questions: config.questions.filter((item) => item.id !== question.id),
                        })
                      }
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="English label"
                  value={question.label.en}
                  onChange={(value) =>
                    updateQuestion(question.id, { label: { ...question.label, en: value } })
                  }
                />
                <TextField
                  label="中文问题"
                  value={question.label.zh}
                  onChange={(value) =>
                    updateQuestion(question.id, { label: { ...question.label, zh: value } })
                  }
                />
                <label className="text-sm text-gray-700">
                  Type
                  <select
                    value={question.type}
                    disabled={locked}
                    onChange={(changeEvent) =>
                      updateQuestion(question.id, {
                        type: changeEvent.currentTarget.value as ReviewQuestionType,
                      })
                    }
                    className="mt-1 w-full rounded border border-gray-200 px-3 py-2 disabled:bg-gray-100"
                  >
                    {questionTypes.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-gray-700">
                  Visibility
                  <select
                    value={question.visibility}
                    disabled={locked}
                    onChange={(changeEvent) =>
                      updateQuestion(question.id, {
                        visibility: changeEvent.currentTarget.value as EventReviewQuestion["visibility"],
                      })
                    }
                    className="mt-1 w-full rounded border border-gray-200 px-3 py-2 disabled:bg-gray-100"
                  >
                    <option value="internal">Internal only</option>
                    <option value="public">Eligible for approved recap display</option>
                  </select>
                </label>
              </div>

              {choiceType ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <ChoiceField
                    label="English choices (one per line)"
                    values={question.options.en}
                    onChange={(values) =>
                      updateQuestion(question.id, { options: { ...question.options, en: values } })
                    }
                  />
                  <ChoiceField
                    label="中文选项（每行一项，顺序对应）"
                    values={question.options.zh}
                    onChange={(values) =>
                      updateQuestion(question.id, { options: { ...question.options, zh: values } })
                    }
                  />
                </div>
              ) : null}

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={question.required}
                  disabled={locked}
                  onChange={(changeEvent) =>
                    updateQuestion(question.id, { required: changeEvent.currentTarget.checked })
                  }
                />
                Required
              </label>
            </article>
          );
        })}
      </div>

      <button
        type="button"
        className="rounded border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-900"
        onClick={() =>
          updateConfig({
            ...config,
            questions: [...config.questions, makeQuestion(config.questions.length + 1)],
          })
        }
      >
        Add review question
      </button>

      <section className="card space-y-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Optional gift</h3>
          <p className="mt-1 text-sm text-gray-600">
            When disabled, the completion page contains no gift language.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
          <input
            type="checkbox"
            checked={config.reward.enabled}
            onChange={(changeEvent) =>
              updateConfig({
                ...config,
                reward: { ...config.reward, enabled: changeEvent.currentTarget.checked },
              })
            }
          />
          Enable gift instructions
        </label>
        {config.reward.enabled ? (
          <div className="grid gap-4 md:grid-cols-2">
            {(["en", "zh"] as const).map((language) => (
              <div key={language} className="space-y-3">
                <TextField
                  label={language === "en" ? "Gift description" : "礼品说明"}
                  value={config.reward.description[language]}
                  onChange={(value) =>
                    updateConfig({
                      ...config,
                      reward: {
                        ...config.reward,
                        description: { ...config.reward.description, [language]: value },
                      },
                    })
                  }
                />
                <TextAreaField
                  label={language === "en" ? "Redemption instructions" : "领取说明"}
                  value={config.reward.redemptionInstructions[language]}
                  onChange={(value) =>
                    updateConfig({
                      ...config,
                      reward: {
                        ...config.reward,
                        redemptionInstructions: {
                          ...config.reward.redemptionInstructions,
                          [language]: value,
                        },
                      },
                    })
                  }
                />
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card space-y-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Completion message</h3>
          <p className="mt-1 text-sm text-gray-600">
            This message is always shown. Gift details are a separate conditional section.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {(["en", "zh"] as const).map((language) => (
            <div key={language} className="space-y-3">
              <TextField
                label={language === "en" ? "Thank-you title" : "感谢标题"}
                value={config.thankYouTitle[language]}
                onChange={(value) =>
                  updateConfig({
                    ...config,
                    thankYouTitle: { ...config.thankYouTitle, [language]: value },
                  })
                }
              />
              <TextAreaField
                label={language === "en" ? "Thank-you body" : "感谢正文"}
                value={config.thankYouBody[language]}
                onChange={(value) =>
                  updateConfig({
                    ...config,
                    thankYouBody: { ...config.thankYouBody, [language]: value },
                  })
                }
              />
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function TextField(props: { label: string; value: string; onChange(value: string): void }) {
  return (
    <label className="text-sm text-gray-700">
      {props.label}
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
      />
    </label>
  );
}

function TextAreaField(props: { label: string; value: string; onChange(value: string): void }) {
  return (
    <label className="block text-sm text-gray-700">
      {props.label}
      <textarea
        rows={3}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
      />
    </label>
  );
}

function ChoiceField(props: { label: string; values: string[]; onChange(values: string[]): void }) {
  return (
    <label className="text-sm text-gray-700">
      {props.label}
      <textarea
        rows={4}
        value={props.values.join("\n")}
        onChange={(event) =>
          props.onChange(
            event.currentTarget.value.split("\n").map((item) => item.trim()).filter(Boolean),
          )
        }
        className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
      />
    </label>
  );
}
