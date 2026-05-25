import { describe, expect, it } from "vitest";
import { validateRegistrationAnswers } from "./validation";
import type { EventRegistrationQuestion } from "@/lib/types";

const questions: EventRegistrationQuestion[] = [
  {
    id: "q-level",
    key: "level",
    type: "single_choice",
    required: true,
    label: { zh: "水平", en: "" },
    helpText: { zh: "", en: "" },
    options: { zh: ["新手", "进阶"], en: [] },
  },
  {
    id: "q-pass",
    key: "pass",
    type: "multiple_choice",
    required: false,
    label: { zh: "雪票", en: "" },
    helpText: { zh: "", en: "" },
    options: { zh: ["Ikon", "Epic"], en: [] },
  },
];

describe("registration answer validation", () => {
  it("accepts valid modular answers", () => {
    expect(validateRegistrationAnswers(questions, { level: "新手", pass: ["Ikon"] }).success).toBe(
      true,
    );
  });

  it("rejects missing required answers and invalid choices", () => {
    const result = validateRegistrationAnswers(questions, { level: "其他" });
    expect(result.success).toBe(false);
  });
});
