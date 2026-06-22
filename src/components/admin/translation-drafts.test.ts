import { describe, expect, it } from "vitest";

import type { Event, EventRecap } from "@/lib/types";
import {
  applyEventTranslations,
  applyRecapTranslations,
  collectEventTranslationItems,
  collectRecapTranslationItems,
} from "./translation-drafts";

function eventDraft(): Event {
  return {
    slug: "demo",
    status: "draft",
    registrationState: "closed",
    title: { zh: "zh title", en: "" },
    eventDate: "2026-01-01",
    meetTime: "08:00",
    meetLocation: { zh: "zh meet", en: "" },
    activityLocation: { zh: "zh resort", en: "Existing resort" },
    locationUrl: "https://maps.example.com",
    coverImage: "",
    capacity: 20,
    registrationCount: 0,
    registrationCloseAt: "2025-12-31T18:00",
    requiresApproval: false,
    allowWaitlist: true,
    allowCancellation: true,
    feeAmount: "100",
    paymentInstructions: { zh: "zh pay", en: "" },
    seoTitle: { zh: "", en: "" },
    seoDescription: { zh: "zh seo", en: "" },
    registrationQuestions: [
      {
        id: "level",
        key: "level",
        type: "single_choice",
        required: true,
        label: { zh: "zh level", en: "" },
        helpText: { zh: "", en: "" },
        options: { zh: ["zh beginner", "zh advanced"], en: [] },
      },
    ],
    detailModules: [
      {
        id: "intro",
        type: "intro",
        displayMode: "rich_text",
        title: { zh: "zh intro", en: "" },
        content: { zh: "zh content", en: "" },
        items: { zh: [], en: [] },
      },
      {
        id: "packing",
        type: "notes",
        displayMode: "list",
        title: { zh: "zh packing", en: "" },
        content: { zh: "", en: "" },
        items: { zh: ["zh gloves", "zh helmet"], en: [] },
      },
    ],
  };
}

function recapDraft(): EventRecap {
  return {
    slug: "demo",
    status: "draft",
    title: { zh: "zh recap", en: "" },
    summary: { zh: "zh summary", en: "Existing summary" },
    content: { zh: "zh content", en: "" },
    date: "2026-01-01",
    location: { zh: "zh resort", en: "" },
    coverImage: "",
    media: [],
    tags: { zh: ["zh snow", "zh weekend"], en: [] },
    seoTitle: { zh: "zh seo title", en: "" },
    seoDescription: { zh: "", en: "" },
    eventSlug: "demo-event",
  };
}

describe("admin translation draft helpers", () => {
  it("collects only event fields with source content and an empty target", () => {
    const items = collectEventTranslationItems(eventDraft(), "zh", "en");

    expect(items.map((item) => item.id)).toEqual([
      "event.title",
      "event.meetLocation",
      "event.paymentInstructions",
      "event.seoDescription",
      "event.registrationQuestions.level.label",
      "event.registrationQuestions.level.options.0",
      "event.registrationQuestions.level.options.1",
      "event.detailModules.intro.title",
      "event.detailModules.intro.content",
      "event.detailModules.packing.title",
      "event.detailModules.packing.items.0",
      "event.detailModules.packing.items.1",
    ]);
    expect(items.find((item) => item.id === "event.activityLocation")).toBeUndefined();
    expect(items.find((item) => item.id === "event.seoTitle")).toBeUndefined();
  });

  it("applies event translations without overwriting existing target content", () => {
    const next = applyEventTranslations(eventDraft(), "en", [
      { id: "event.title", value: "English title" },
      { id: "event.activityLocation", value: "Should not overwrite" },
      { id: "event.registrationQuestions.level.options.0", value: "Beginner" },
      { id: "event.registrationQuestions.level.options.1", value: "Advanced" },
      { id: "event.detailModules.packing.items.0", value: "Gloves" },
    ]);

    expect(next.title.en).toBe("English title");
    expect(next.activityLocation.en).toBe("Existing resort");
    expect(next.registrationQuestions[0].options.en).toEqual(["Beginner", "Advanced"]);
    expect(next.detailModules[1].items.en).toEqual(["Gloves"]);
  });

  it("collects and applies recap translations while preserving existing target values", () => {
    const items = collectRecapTranslationItems(recapDraft(), "zh", "en");

    expect(items.map((item) => item.id)).toEqual([
      "recap.title",
      "recap.content",
      "recap.location",
      "recap.tags.0",
      "recap.tags.1",
      "recap.seoTitle",
    ]);

    const next = applyRecapTranslations(recapDraft(), "en", [
      { id: "recap.title", value: "Recap title" },
      { id: "recap.summary", value: "Should not overwrite" },
      { id: "recap.tags.0", value: "Snow" },
      { id: "recap.tags.1", value: "Weekend" },
    ]);

    expect(next.title.en).toBe("Recap title");
    expect(next.summary.en).toBe("Existing summary");
    expect(next.tags.en).toEqual(["Snow", "Weekend"]);
  });
});
