import { z } from "zod";

import type { Event } from "@/lib/types";
import { ensureRequiredRegistrationQuestions } from "./required-registration-questions";

const bilingualText = z.object({
  en: z.string().default(""),
  zh: z.string().default(""),
});

const bilingualList = z.object({
  en: z.array(z.string()).default([]),
  zh: z.array(z.string()).default([]),
});

function hasMeaningfulText(value: string) {
  return value.trim().length > 0;
}

function hasMeaningfulListItem(items: string[]) {
  return items.some(hasMeaningfulText);
}

function hasMeaningfulDetailModule(moduleRow: Event["detailModules"][number]) {
  if (moduleRow.displayMode === "list") {
    return hasMeaningfulListItem(moduleRow.items.zh);
  }

  return hasMeaningfulText(moduleRow.content.zh);
}

const dateTime = z
  .string()
  .trim()
  .refine(
    (value) => !value || !Number.isNaN(new Date(value).getTime()),
    "Enter a valid date and time.",
  );

const dateString = z
  .string()
  .trim()
  .refine(
    (value) => !value || !Number.isNaN(new Date(`${value}T00:00:00`).getTime()),
    "Enter a valid date.",
  );

const questionSchema = z
  .object({
    id: z.string().trim().min(1),
    key: z.string().trim().min(1).regex(/^[a-z][a-z0-9_]*$/),
    type: z.enum(["text", "single_choice", "multiple_choice", "yes_no", "date", "phone"]),
    required: z.boolean().default(false),
    label: bilingualText,
    helpText: bilingualText.default({ en: "", zh: "" }),
    options: bilingualList.default({ en: [], zh: [] }),
  })
  .superRefine((question, ctx) => {
    if (!hasMeaningfulText(question.label.zh)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["label", "zh"],
        message: "Participant questions need Chinese labels.",
      });
    }

    if (
      (question.type === "single_choice" || question.type === "multiple_choice") &&
      !hasMeaningfulListItem(question.options.zh)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options", "zh"],
        message: "Choice questions need Chinese options.",
      });
    }
  });

const moduleSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(["intro", "highlights", "itinerary", "notes", "fees", "refund", "contact", "custom"]),
  displayMode: z.enum(["rich_text", "list"]).default("rich_text"),
  title: bilingualText,
  content: bilingualText.default({ en: "", zh: "" }),
  items: bilingualList.default({ en: [], zh: [] }),
});

const editorSchema = z.object({
  slug: z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  registrationState: z.enum(["open", "closed", "full"]).default("closed"),
  title: bilingualText.default({ en: "", zh: "" }),
  eventDate: dateString.default(""),
  meetTime: z.string().trim().default(""),
  meetLocation: bilingualText.default({ en: "", zh: "" }),
  activityLocation: bilingualText.default({ en: "", zh: "" }),
  locationUrl: z.string().default(""),
  coverImage: z.string().default(""),
  capacity: z.coerce.number().int().min(0),
  registrationCount: z.coerce.number().int().min(0).default(0),
  registrationCloseAt: dateTime.default(""),
  requiresApproval: z.boolean().default(false),
  allowWaitlist: z.boolean().default(false),
  allowCancellation: z.boolean().default(false),
  feeAmount: z.string().default(""),
  paymentModel: z.enum(["free", "deposit", "full_prepay"]).default("free"),
  depositAmount: z.coerce.number().min(0).nullable().default(null),
  depositCurrency: z.enum(["usd", "cny", "eur", "gbp", "jpy"]).default("usd"),
  fullPaymentAmount: z.coerce.number().min(0).nullable().default(null),
  paymentInstructions: bilingualText.default({ en: "", zh: "" }),
  seoTitle: bilingualText.default({ en: "", zh: "" }),
  seoDescription: bilingualText.default({ en: "", zh: "" }),
  registrationQuestions: z.array(questionSchema).default([]),
  detailModules: z.array(moduleSchema).default([]),
  waiverTextEn: z.string().nullable().default(null),
  waiverTextSha: z.string().nullable().default(null),
}).superRefine((data, ctx) => {
  if (data.paymentModel === "deposit" && (data.depositAmount === null || data.depositAmount <= 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["depositAmount"],
      message: "Deposit amount must be greater than 0",
    });
  }
  if (data.paymentModel === "full_prepay" && (data.fullPaymentAmount === null || data.fullPaymentAmount <= 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fullPaymentAmount"],
      message: "Full payment amount must be greater than 0",
    });
  }
});

export function parseEventEditorInput(input: unknown) {
  const result = editorSchema.safeParse(input);
  if (!result.success) return result;
  return {
    ...result,
    data: {
      ...result.data,
      registrationQuestions: ensureRequiredRegistrationQuestions(result.data.registrationQuestions),
      ...(result.data.paymentModel === "free"
        ? { depositAmount: null as null, fullPaymentAmount: null as null }
        : {}),
    },
  };
}

export function validatePublishableEvent(event: Event) {
  const requiredFields: Array<[string, unknown]> = [
    ["title.zh", event.title.zh],
    ["eventDate", event.eventDate],
    ["meetTime", event.meetTime],
    ["activityLocation.zh", event.activityLocation.zh],
  ];

  const missingFields = requiredFields
    .filter(([, value]) => typeof value !== "string" || !value.trim())
    .map(([field]) => field);

  if (!event.detailModules.some(hasMeaningfulDetailModule)) {
    missingFields.push("detailModules");
  }

  return missingFields;
}
