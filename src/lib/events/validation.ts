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

const merchantBoothCurrency = z.enum(["usd", "cny", "eur", "gbp", "jpy"]);

const merchantBoothPlanSchema = z
  .object({
    id: z.string().trim().min(1),
    name: bilingualText,
    description: bilingualText.default({ en: "", zh: "" }),
    priceAmount: z.coerce.number().min(0),
    priceCurrency: merchantBoothCurrency.default("usd"),
  })
  .superRefine((plan, ctx) => {
    if (!hasMeaningfulText(plan.name.zh)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name", "zh"],
        message: "Booth plans need a Chinese name.",
      });
    }
    if (!Number.isFinite(plan.priceAmount) || plan.priceAmount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["priceAmount"],
        message: "Booth plan price must be greater than 0.",
      });
    }
  });

const merchantBoothBoothSchema = z
  .object({
    id: z.string().trim().min(1),
    boothPlanId: z.string().trim().min(1),
    boothCode: z.string().trim().min(1),
  })
  .superRefine((booth, ctx) => {
    if (!hasMeaningfulText(booth.boothCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["boothCode"],
        message: "Booth identifier cannot be blank.",
      });
    }
  });

const merchantBoothProgramSchema = z
  .object({
    enabled: z.boolean().default(false),
    paymentInstructions: bilingualText.default({ en: "", zh: "" }),
    plans: z.array(merchantBoothPlanSchema).default([]),
    booths: z.array(merchantBoothBoothSchema).default([]),
  })
  .superRefine((program, ctx) => {
    const planIds = new Set(program.plans.map((plan) => plan.id));
    program.booths.forEach((booth, index) => {
      if (!planIds.has(booth.boothPlanId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["booths", index, "boothPlanId"],
          message: "Booth plan does not match a configured booth plan.",
        });
      }
    });
    const seenCodes = new Set<string>();
    program.booths.forEach((booth, index) => {
      const normalized = booth.boothCode.trim().toLowerCase();
      if (seenCodes.has(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["booths", index, "boothCode"],
          message: "Booth identifier must be unique within the program.",
        });
      }
      seenCodes.add(normalized);
    });
  });

function hasMeaningfulText(value: string) {
  return value.trim().length > 0;
}

function hasMeaningfulListItem(items: string[]) {
  return items.some(hasMeaningfulText);
}

function hasMeaningfulDetailModule(moduleRow: Event["detailModules"][number]) {
  if (moduleRow.displayMode === "list") {
    return hasMeaningfulListItem(moduleRow.items.en);
  }

  return hasMeaningfulText(moduleRow.content.en);
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
    if (!hasMeaningfulText(question.label.en)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["label", "en"],
        message: "Participant questions need English labels.",
      });
    }

    if (
      (question.type === "single_choice" || question.type === "multiple_choice") &&
      !hasMeaningfulListItem(question.options.en)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options", "en"],
        message: "Choice questions need English options.",
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
  merchantBoothProgram: merchantBoothProgramSchema.nullable().default(null),
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
  const programEnabled = result.data.merchantBoothProgram?.enabled === true;
  return {
    ...result,
    data: {
      ...result.data,
      registrationQuestions: ensureRequiredRegistrationQuestions(result.data.registrationQuestions),
      ...(result.data.paymentModel === "free"
        ? { depositAmount: null as null, fullPaymentAmount: null as null }
        : {}),
      merchantBoothProgram: programEnabled ? result.data.merchantBoothProgram : null,
    },
  };
}

export function validatePublishableEvent(event: Event) {
  const requiredFields: Array<[string, unknown]> = [
    ["title.en", event.title.en],
    ["eventDate", event.eventDate],
    ["meetTime", event.meetTime],
    ["activityLocation.en", event.activityLocation.en],
  ];

  const missingFields = requiredFields
    .filter(([, value]) => typeof value !== "string" || !value.trim())
    .map(([field]) => field);

  if (!event.detailModules.some(hasMeaningfulDetailModule)) {
    missingFields.push("detailModules");
  }

  return missingFields;
}
