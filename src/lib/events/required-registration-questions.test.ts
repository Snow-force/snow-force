import { describe, expect, it } from "vitest";

import type { EventRegistrationQuestion } from "@/lib/types";
import { ensureRequiredRegistrationQuestions, isSystemRegistrationQuestion } from "./required-registration-questions";

function question(key: string, label = key): EventRegistrationQuestion {
  return {
    id: `q-${key}`,
    key,
    type: "single_choice",
    required: false,
    label: { en: label, zh: label },
    helpText: { en: "", zh: "" },
    options: { en: ["YES"], zh: ["YES"] },
  };
}

describe("required registration questions", () => {
  it("inserts name and email as the first required text questions", () => {
    const result = ensureRequiredRegistrationQuestions([question("field1")]);

    expect(result.map((item) => item.key)).toEqual(["name", "email", "field1"]);
    expect(result[0]).toMatchObject({
      id: "system-name",
      key: "name",
      type: "text",
      required: true,
      label: { en: "Name", zh: "姓名" },
    });
    expect(result[1]).toMatchObject({
      id: "system-email",
      key: "email",
      type: "text",
      required: true,
      label: { en: "Email", zh: "邮箱" },
    });
  });

  it("keeps existing labels but forces name and email keys, types, and required flags", () => {
    const result = ensureRequiredRegistrationQuestions([
      { ...question("email", "Email address"), type: "phone", required: false },
      question("field1"),
      { ...question("name", "Full name"), type: "yes_no", required: false },
    ]);

    expect(result.map((item) => item.key)).toEqual(["name", "email", "field1"]);
    expect(result[0]).toMatchObject({
      id: "q-name",
      key: "name",
      type: "text",
      required: true,
      label: { en: "Full name", zh: "Full name" },
    });
    expect(result[1]).toMatchObject({
      id: "q-email",
      key: "email",
      type: "text",
      required: true,
      label: { en: "Email address", zh: "Email address" },
    });
  });

  it("identifies system registration questions", () => {
    expect(isSystemRegistrationQuestion("name")).toBe(true);
    expect(isSystemRegistrationQuestion("email")).toBe(true);
    expect(isSystemRegistrationQuestion("phone")).toBe(false);
  });
});
