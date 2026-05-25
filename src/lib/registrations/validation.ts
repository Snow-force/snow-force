import type { EventRegistrationQuestion, RegistrationAnswers } from "@/lib/types";
export type { RegistrationAnswerValue, RegistrationAnswers } from "@/lib/types";

export function validateRegistrationAnswers(
  questions: EventRegistrationQuestion[],
  answers: RegistrationAnswers,
) {
  const errors: Record<string, string> = {};

  for (const question of questions) {
    const value = answers[question.key];
    const missing =
      value === undefined ||
      (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0);

    if (question.required && missing) {
      errors[question.key] = `${question.key} is required`;
      continue;
    }

    if (missing) continue;

    const options = question.options.zh;
    if (question.type === "single_choice") {
      if (typeof value !== "string" || !options.includes(value)) {
        errors[question.key] = `${question.key} is invalid`;
      }
    }
    if (question.type === "multiple_choice") {
      if (!Array.isArray(value) || value.some((item) => !options.includes(item))) {
        errors[question.key] = `${question.key} is invalid`;
      }
    }
    if (question.type === "phone" && typeof value === "string" && value.trim().length < 5) {
      errors[question.key] = `${question.key} is invalid`;
    }
  }

  return Object.keys(errors).length
    ? { success: false as const, errors }
    : { success: true as const, data: answers };
}
