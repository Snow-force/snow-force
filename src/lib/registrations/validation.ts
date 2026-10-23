import type { EventRegistrationQuestion, RegistrationAnswers } from "@/lib/types";
import { participantQuestions } from "./participation";
export type { RegistrationAnswerValue, RegistrationAnswers } from "@/lib/types";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegistrationAnswers(
  questions: EventRegistrationQuestion[],
  answers: RegistrationAnswers,
  kind: "self" | "proxy" = "self",
) {
  const errors: Record<string, string> = {};
  const data: RegistrationAnswers = {};

  for (const question of participantQuestions(questions, kind)) {
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

    const options = [...question.options.zh, ...question.options.en];

    switch (question.type) {
      case "text":
        if (typeof value !== "string") {
          errors[question.key] = `${question.key} is invalid`;
        }
        if (question.key === "email" && (typeof value !== "string" || !emailPattern.test(value.trim()))) {
          errors[question.key] = "Email is invalid";
        }
        break;
      case "phone":
        if (typeof value !== "string" || value.trim().length < 5) {
          errors[question.key] = `${question.key} is invalid`;
        }
        break;
      case "date":
        if (typeof value !== "string" || Number.isNaN(Date.parse(value.trim()))) {
          errors[question.key] = `${question.key} is invalid`;
        }
        break;
      case "yes_no":
        if (typeof value !== "boolean") {
          errors[question.key] = `${question.key} is invalid`;
        }
        break;
      case "single_choice":
        if (typeof value !== "string" || !options.includes(value)) {
          errors[question.key] = `${question.key} is invalid`;
        }
        break;
      case "multiple_choice":
        if (
          !Array.isArray(value) ||
          value.some((item) => typeof item !== "string" || !options.includes(item))
        ) {
          errors[question.key] = `${question.key} is invalid`;
        }
        break;
      default:
        errors[question.key] = `${question.key} is invalid`;
    }

    if (!errors[question.key]) data[question.key] = value;
  }

  return Object.keys(errors).length
    ? { success: false as const, errors }
    : { success: true as const, data };
}
