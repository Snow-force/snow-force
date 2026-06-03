import { describe, expect, it } from "vitest";
import { validateRegistrationAnswers } from "./validation";
import type { EventRegistrationQuestion, RegistrationAnswers } from "@/lib/types";

const allQuestionTypes: EventRegistrationQuestion[] = [
  {
    id: "q-name",
    key: "name",
    type: "text",
    required: true,
    label: { zh: "Name", en: "Name" },
    helpText: { zh: "", en: "" },
    options: { zh: [], en: [] },
  },
  {
    id: "q-phone",
    key: "phone",
    type: "phone",
    required: true,
    label: { zh: "Phone", en: "Phone" },
    helpText: { zh: "", en: "" },
    options: { zh: [], en: [] },
  },
  {
    id: "q-date",
    key: "birthDate",
    type: "date",
    required: true,
    label: { zh: "Date", en: "Date" },
    helpText: { zh: "", en: "" },
    options: { zh: [], en: [] },
  },
  {
    id: "q-rental",
    key: "needsRental",
    type: "yes_no",
    required: true,
    label: { zh: "Rental", en: "Rental" },
    helpText: { zh: "", en: "" },
    options: { zh: [], en: [] },
  },
  {
    id: "q-level",
    key: "level",
    type: "single_choice",
    required: true,
    label: { zh: "Level", en: "Level" },
    helpText: { zh: "", en: "" },
    options: { zh: ["beginner-zh", "advanced-zh"], en: ["beginner-en", "advanced-en"] },
  },
  {
    id: "q-pass",
    key: "pass",
    type: "multiple_choice",
    required: false,
    label: { zh: "Pass", en: "Pass" },
    helpText: { zh: "", en: "" },
    options: { zh: ["ikon-zh", "epic-zh"], en: ["ikon-en", "epic-en"] },
  },
];

const validAnswers: RegistrationAnswers = {
  name: "Tai",
  email: "tai@example.com",
  phone: "555-0100",
  birthDate: "2026-02-01",
  needsRental: false,
  level: "beginner-en",
  pass: ["ikon-zh", "epic-en"],
};

const optionalQuestionTypes = allQuestionTypes.map((question) => ({
  ...question,
  required: false,
}));

describe("registration answer validation", () => {
  it("accepts valid answers for every modular question type", () => {
    const result = validateRegistrationAnswers(allQuestionTypes, validAnswers);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validAnswers);
    }
  });

  it("drops unknown client-supplied keys from sanitized data", () => {
    const result = validateRegistrationAnswers(allQuestionTypes, {
      ...validAnswers,
      adminNote: "client supplied junk",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validAnswers);
      expect(result.data).not.toHaveProperty("adminNote");
    }
  });

  it("rejects missing required answers", () => {
    const result = validateRegistrationAnswers(allQuestionTypes, {
      ...validAnswers,
      name: "   ",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.name).toBe("name is required");
    }
  });

  it("rejects invalid text values when present", () => {
    const result = validateRegistrationAnswers(allQuestionTypes, {
      ...validAnswers,
      name: true,
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid phone values when present", () => {
    const result = validateRegistrationAnswers(allQuestionTypes, {
      ...validAnswers,
      phone: "1234",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid date values when present", () => {
    const result = validateRegistrationAnswers(allQuestionTypes, {
      ...validAnswers,
      birthDate: "not-a-date",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid yes/no values when present", () => {
    const result = validateRegistrationAnswers(allQuestionTypes, {
      ...validAnswers,
      needsRental: "yes",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid single choice values when present", () => {
    const result = validateRegistrationAnswers(allQuestionTypes, {
      ...validAnswers,
      level: ["beginner-en"],
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid multiple choice values when present", () => {
    const result = validateRegistrationAnswers(allQuestionTypes, {
      ...validAnswers,
      pass: ["ikon-en", "other"],
    });

    expect(result.success).toBe(false);
  });

  it("rejects optional invalid values when they are present", () => {
    const invalidValues: RegistrationAnswers[] = [
      { name: true },
      { phone: "1234" },
      { birthDate: "not-a-date" },
      { needsRental: "yes" },
      { level: ["beginner-en"] },
      { pass: ["ikon-en", "other"] },
    ];

    for (const answers of invalidValues) {
      expect(validateRegistrationAnswers(optionalQuestionTypes, answers).success).toBe(false);
    }
  });
});
