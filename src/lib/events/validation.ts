import { z } from "zod";

import type { Event } from "@/lib/types";

const bilingualText = z.object({
  en: z.string().default(""),
  zh: z.string().default(""),
});

const bilingualList = z.object({
  en: z.array(z.string()).default([]),
  zh: z.array(z.string()).default([]),
});

const dateTime = z
  .string()
  .trim()
  .refine(
    (value) => !value || !Number.isNaN(new Date(value).getTime()),
    "Enter a valid date and time.",
  );

const registrationFieldSchema = z
  .object({
    key: z.string().trim().min(1),
    label: bilingualText,
    type: z.enum(["text", "email", "tel", "textarea", "select"]),
    required: z.boolean(),
    options: bilingualList.optional(),
    placeholder: bilingualText.optional(),
  })
  .superRefine((field, ctx) => {
    if (field.type === "select" && (!field.options?.en.length || !field.options.zh.length)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Select registration fields require bilingual options.",
      });
    }
  });

const editorSchema = z
  .object({
    slug: z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    status: z.enum(["draft", "published"]).default("draft"),
    registrationState: z.enum(["open", "closed", "full"]).default("closed"),
    title: bilingualText.default({ en: "", zh: "" }),
    subtitle: bilingualText.default({ en: "", zh: "" }),
    description: bilingualText.default({ en: "", zh: "" }),
    highlights: bilingualList.default({ en: [], zh: [] }),
    audienceLevel: bilingualText.default({ en: "", zh: "" }),
    schedule: bilingualText.default({ en: "", zh: "" }),
    location: bilingualText.default({ en: "", zh: "" }),
    locationUrl: z.string().default(""),
    feeInfo: bilingualText.default({ en: "", zh: "" }),
    notices: bilingualList.default({ en: [], zh: [] }),
    coverImage: z.string().default(""),
    media: z.array(z.string()).default([]),
    capacity: z.coerce.number().int().min(0),
    registrationCount: z.coerce.number().int().min(0).default(0),
    registrationOpenAt: dateTime,
    registrationCloseAt: dateTime,
    eventStartAt: dateTime,
    eventEndAt: dateTime,
    registrationFields: z.array(registrationFieldSchema).default([]),
    tags: bilingualList.default({ en: [], zh: [] }),
    seoTitle: bilingualText.default({ en: "", zh: "" }),
    seoDescription: bilingualText.default({ en: "", zh: "" }),
  })
  .superRefine((event, ctx) => {
    if (
      event.eventStartAt &&
      event.eventEndAt &&
      new Date(event.eventEndAt) < new Date(event.eventStartAt)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["eventEndAt"],
        message: "Event end must follow event start.",
      });
    }

    if (
      event.registrationOpenAt &&
      event.registrationCloseAt &&
      new Date(event.registrationCloseAt) < new Date(event.registrationOpenAt)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["registrationCloseAt"],
        message: "Registration close must follow registration open.",
      });
    }
  });

export function parseEventEditorInput(input: unknown) {
  return editorSchema.safeParse(input);
}

export function validatePublishableEvent(event: Event) {
  const requiredFields: Array<[string, unknown]> = [
    ["title.en", event.title.en],
    ["title.zh", event.title.zh],
    ["description.en", event.description.en],
    ["description.zh", event.description.zh],
    ["location.en", event.location.en],
    ["location.zh", event.location.zh],
    ["eventStartAt", event.eventStartAt],
    ["eventEndAt", event.eventEndAt],
    ["registrationOpenAt", event.registrationOpenAt],
    ["registrationCloseAt", event.registrationCloseAt],
  ];

  return requiredFields.filter(([, value]) => !value).map(([field]) => field);
}
