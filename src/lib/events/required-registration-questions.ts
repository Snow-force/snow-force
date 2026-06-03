import type { EventRegistrationQuestion } from "@/lib/types";

const requiredQuestions: EventRegistrationQuestion[] = [
  {
    id: "system-name",
    key: "name",
    type: "text",
    required: true,
    label: { en: "Name", zh: "姓名" },
    helpText: { en: "", zh: "" },
    options: { en: [], zh: [] },
  },
  {
    id: "system-email",
    key: "email",
    type: "text",
    required: true,
    label: { en: "Email", zh: "邮箱" },
    helpText: { en: "", zh: "" },
    options: { en: [], zh: [] },
  },
];

export function isSystemRegistrationQuestion(key: string) {
  return key === "name" || key === "email";
}

function enforceSystemQuestion(
  template: EventRegistrationQuestion,
  existing: EventRegistrationQuestion | undefined,
) {
  return {
    ...template,
    ...existing,
    id: existing?.id || template.id,
    key: template.key,
    type: template.type,
    required: true,
    helpText: existing?.helpText ?? template.helpText,
    options: template.options,
    label: {
      en: existing?.label.en || template.label.en,
      zh: existing?.label.zh || template.label.zh,
    },
  };
}

export function ensureRequiredRegistrationQuestions(
  questions: EventRegistrationQuestion[],
): EventRegistrationQuestion[] {
  const nameQuestion = questions.find((question) => question.key === "name");
  const emailQuestion = questions.find((question) => question.key === "email");
  const customQuestions = questions.filter((question) => !isSystemRegistrationQuestion(question.key));

  return [
    enforceSystemQuestion(requiredQuestions[0], nameQuestion),
    enforceSystemQuestion(requiredQuestions[1], emailQuestion),
    ...customQuestions,
  ];
}
