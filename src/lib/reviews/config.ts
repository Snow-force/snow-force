import { z } from "zod";

import type {
  EventReviewAnswerValue,
  EventReviewAnswers,
  EventReviewConfig,
  EventReviewQuestion,
} from "@/lib/types";

export const REVIEW_CONFIG_VERSION = 1 as const;
export const CORE_OVERALL_RATING_KEY = "overall_rating";
export const CORE_IMPROVEMENT_KEY = "improvement";

const bilingualTextSchema = z.object({
  en: z.string().default(""),
  zh: z.string().default(""),
});

const bilingualListSchema = z.object({
  en: z.array(z.string()).default([]),
  zh: z.array(z.string()).default([]),
});

export const reviewQuestionSchema = z.object({
  id: z.string().trim().min(1),
  key: z.string().trim().regex(/^[a-z][a-z0-9_]*$/),
  type: z.enum([
    "rating_5",
    "single_choice",
    "multiple_choice",
    "yes_no",
    "short_text",
    "long_text",
  ]),
  required: z.boolean(),
  visibility: z.enum(["public", "internal"]),
  label: bilingualTextSchema,
  helpText: bilingualTextSchema,
  options: bilingualListSchema,
  minLength: z.number().int().min(0).nullable(),
  maxLength: z.number().int().min(1).max(5000).nullable(),
  maxSelections: z.number().int().min(1).max(20).nullable(),
});

export const eventReviewConfigSchema = z
  .object({
    version: z.literal(REVIEW_CONFIG_VERSION),
    questions: z.array(reviewQuestionSchema).min(2).max(30),
    thankYouTitle: bilingualTextSchema,
    thankYouBody: bilingualTextSchema,
    reward: z.object({
      enabled: z.boolean(),
      description: bilingualTextSchema,
      redemptionInstructions: bilingualTextSchema,
    }),
  })
  .superRefine((config, ctx) => {
    const seen = new Set<string>();
    config.questions.forEach((question, index) => {
      if (seen.has(question.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index, "key"],
          message: "Review question keys must be unique.",
        });
      }
      seen.add(question.key);

      if (!question.label.en.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index, "label", "en"],
          message: "Review questions need an English label.",
        });
      }
      if (
        (question.type === "single_choice" || question.type === "multiple_choice") &&
        !question.options.en.some((option) => option.trim())
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index, "options", "en"],
          message: "Choice questions need English options.",
        });
      }
      if (
        question.minLength !== null &&
        question.maxLength !== null &&
        question.minLength > question.maxLength
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index, "minLength"],
          message: "Minimum length cannot exceed maximum length.",
        });
      }
    });

    const overall = config.questions.find((question) => question.key === CORE_OVERALL_RATING_KEY);
    if (
      !overall ||
      overall.type !== "rating_5" ||
      !overall.required ||
      overall.visibility !== "public"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questions"],
        message: "Overall rating must remain a required public 1-5 rating.",
      });
    }

    const improvement = config.questions.find((question) => question.key === CORE_IMPROVEMENT_KEY);
    if (
      !improvement ||
      improvement.type !== "long_text" ||
      !improvement.required ||
      improvement.visibility !== "internal"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questions"],
        message: "Improvement must remain a required internal long-text question.",
      });
    }

    if (config.reward.enabled) {
      if (!config.reward.description.en.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reward", "description", "en"],
          message: "Reward description is required when a reward is enabled.",
        });
      }
      if (!config.reward.redemptionInstructions.en.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reward", "redemptionInstructions", "en"],
          message: "Reward redemption instructions are required when a reward is enabled.",
        });
      }
    }
  });

export function createDefaultReviewConfig(): EventReviewConfig {
  return {
    version: REVIEW_CONFIG_VERSION,
    questions: [
      {
        id: "review-overall-rating",
        key: CORE_OVERALL_RATING_KEY,
        type: "rating_5",
        required: true,
        visibility: "public",
        label: { en: "How would you rate the event overall?", zh: "你对本次活动的总体评价如何？" },
        helpText: { en: "", zh: "" },
        options: { en: [], zh: [] },
        minLength: null,
        maxLength: null,
        maxSelections: null,
      },
      {
        id: "review-organization-rating",
        key: "organization_rating",
        type: "rating_5",
        required: true,
        visibility: "public",
        label: { en: "How was the event organization?", zh: "你如何评价本次活动的组织安排？" },
        helpText: { en: "", zh: "" },
        options: { en: [], zh: [] },
        minLength: null,
        maxLength: null,
        maxSelections: null,
      },
      {
        id: "review-leader-rating",
        key: "leader_rating",
        type: "rating_5",
        required: false,
        visibility: "public",
        label: { en: "How was the leader or coach?", zh: "你如何评价领队或教练？" },
        helpText: { en: "Leave blank if not applicable.", zh: "如不适用可留空。" },
        options: { en: [], zh: [] },
        minLength: null,
        maxLength: null,
        maxSelections: null,
      },
      {
        id: "review-favorite-parts",
        key: "favorite_parts",
        type: "multiple_choice",
        required: false,
        visibility: "public",
        label: { en: "What did you enjoy most?", zh: "你最喜欢哪些部分？" },
        helpText: { en: "Choose up to three.", zh: "最多选择三项。" },
        options: {
          en: ["Organization", "Route", "Coaching", "Community", "Communication", "Location"],
          zh: ["组织安排", "路线", "教学", "社区氛围", "沟通", "场地"],
        },
        minLength: null,
        maxLength: null,
        maxSelections: 3,
      },
      {
        id: "review-best-part",
        key: "best_part",
        type: "long_text",
        required: true,
        visibility: "public",
        label: { en: "What worked especially well?", zh: "这次活动做得最好的一点是什么？" },
        helpText: { en: "Please be specific.", zh: "请尽量具体。" },
        options: { en: [], zh: [] },
        minLength: 20,
        maxLength: 600,
        maxSelections: null,
      },
      {
        id: "review-improvement",
        key: CORE_IMPROVEMENT_KEY,
        type: "long_text",
        required: true,
        visibility: "internal",
        label: { en: "What should we improve next time?", zh: "下次最需要改进的一点是什么？" },
        helpText: {
          en: "Only the SnowForce team will see this answer.",
          zh: "该回答仅 SnowForce 团队可见。",
        },
        options: { en: [], zh: [] },
        minLength: 20,
        maxLength: 600,
        maxSelections: null,
      },
      {
        id: "review-join-again",
        key: "join_again",
        type: "single_choice",
        required: true,
        visibility: "internal",
        label: { en: "Would you join another SnowForce event?", zh: "你愿意再次参加 SnowForce 活动吗？" },
        helpText: { en: "", zh: "" },
        options: {
          en: ["Yes", "Depends on the event", "No"],
          zh: ["愿意", "看活动安排", "不愿意"],
        },
        minLength: null,
        maxLength: null,
        maxSelections: null,
      },
    ],
    thankYouTitle: {
      en: "Thank you for your thoughtful feedback",
      zh: "感谢你的认真反馈",
    },
    thankYouBody: {
      en: "Your feedback has been submitted and will help us improve future SnowForce events.",
      zh: "你的反馈已成功提交，将帮助我们持续改进之后的 SnowForce 活动。",
    },
    reward: {
      enabled: false,
      description: { en: "", zh: "" },
      redemptionInstructions: { en: "", zh: "" },
    },
  };
}

export function normalizeReviewConfig(value: unknown): EventReviewConfig {
  const parsed = eventReviewConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : createDefaultReviewConfig();
}

function answerIsBlank(value: EventReviewAnswerValue | undefined) {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function validateAnswer(
  question: EventReviewQuestion,
  value: EventReviewAnswerValue | undefined,
): string | undefined {
  if (answerIsBlank(value)) return question.required ? "This question is required." : undefined;

  if (question.type === "rating_5") {
    return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5
      ? undefined
      : "Choose a rating from 1 to 5.";
  }
  if (question.type === "yes_no") {
    return typeof value === "boolean" ? undefined : "Choose yes or no.";
  }
  if (question.type === "single_choice") {
    return typeof value === "string" && question.options.en.includes(value)
      ? undefined
      : "Choose one available option.";
  }
  if (question.type === "multiple_choice") {
    if (!Array.isArray(value) || !value.every((item) => question.options.en.includes(item))) {
      return "Choose only available options.";
    }
    if (question.maxSelections !== null && value.length > question.maxSelections) {
      return `Choose no more than ${question.maxSelections} options.`;
    }
    return undefined;
  }
  if (typeof value !== "string") return "Enter text.";
  const length = value.trim().length;
  if (question.minLength !== null && length < question.minLength) {
    return `Enter at least ${question.minLength} characters.`;
  }
  if (question.maxLength !== null && length > question.maxLength) {
    return `Enter no more than ${question.maxLength} characters.`;
  }
  return undefined;
}

export function validateReviewAnswers(
  config: EventReviewConfig,
  answers: EventReviewAnswers,
): { success: true; answers: EventReviewAnswers } | { success: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const normalized: EventReviewAnswers = {};

  for (const question of config.questions) {
    const value = answers[question.key];
    const error = validateAnswer(question, value);
    if (error) errors[question.key] = error;
    if (!answerIsBlank(value)) normalized[question.key] = value as EventReviewAnswerValue;
  }

  return Object.keys(errors).length > 0
    ? { success: false, errors }
    : { success: true, answers: normalized };
}

export function publicReviewAnswers(
  config: EventReviewConfig,
  answers: EventReviewAnswers,
): EventReviewAnswers {
  const publicKeys = new Set(
    config.questions
      .filter((question) => question.visibility === "public")
      .map((question) => question.key),
  );
  return Object.fromEntries(
    Object.entries(answers).filter(([key]) => publicKeys.has(key)),
  ) as EventReviewAnswers;
}
