import { describe, expect, it } from "vitest";

import {
  createDefaultReviewConfig,
  eventReviewConfigSchema,
  publicReviewAnswers,
  validateReviewAnswers,
} from "./config";

describe("event review configuration", () => {
  it("provides the immutable core questions and a gift-free completion state by default", () => {
    const config = createDefaultReviewConfig();

    expect(eventReviewConfigSchema.safeParse(config).success).toBe(true);
    expect(config.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "overall_rating",
          type: "rating_5",
          required: true,
          visibility: "public",
        }),
        expect.objectContaining({
          key: "improvement",
          type: "long_text",
          required: true,
          visibility: "internal",
        }),
      ]),
    );
    expect(config.reward.enabled).toBe(false);
    expect(config.reward.description).toEqual({ en: "", zh: "" });
  });

  it("rejects a reward without a description or redemption instructions", () => {
    const config = createDefaultReviewConfig();
    config.reward.enabled = true;

    const parsed = eventReviewConfigSchema.safeParse(config);

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.flatten().fieldErrors.reward).toBeDefined();
  });

  it("validates required answers and canonical bilingual choice values", () => {
    const config = createDefaultReviewConfig();
    const result = validateReviewAnswers(config, {
      overall_rating: 5,
      organization_rating: 4,
      favorite_parts: ["Community"],
      best_part: "The group communication was clear and welcoming.",
      improvement: "Send the final meeting point a little earlier next time.",
      join_again: "Yes",
    });

    expect(result.success).toBe(true);
  });

  it("removes internal-only answers before public recap display", () => {
    const config = createDefaultReviewConfig();
    const answers = publicReviewAnswers(config, {
      overall_rating: 5,
      best_part: "A thoughtful and specific public answer.",
      improvement: "Private operational feedback.",
      join_again: "Yes",
    });

    expect(answers).toEqual({
      overall_rating: 5,
      best_part: "A thoughtful and specific public answer.",
    });
  });
});
