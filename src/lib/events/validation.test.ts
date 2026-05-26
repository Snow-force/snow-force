import { describe, expect, it } from "vitest";

import { parseEventEditorInput, validatePublishableEvent } from "./validation";

const draftInput = {
  slug: "winter-day",
  capacity: "24",
  eventDate: "2026-12-03",
  meetTime: "10:00",
  registrationCloseAt: "2026-12-02T18:00",
  registrationQuestions: [
    {
      id: "question-name",
      key: "name",
      label: { en: "Name", zh: "姓名" },
      type: "text",
      required: true,
    },
  ],
  detailModules: [],
};

describe("event editor validation", () => {
  it("parses a modular editor payload into an event aggregate", () => {
    const result = parseEventEditorInput({
      slug: "big-bear-day",
      title: { zh: "大熊山一日滑雪", en: "" },
      eventDate: "2026-12-12",
      meetTime: "07:30",
      meetLocation: { zh: "Rowland Heights 集合点", en: "" },
      activityLocation: { zh: "Big Bear Mountain Resort", en: "" },
      capacity: "24",
      registrationCloseAt: "2026-12-10T18:00",
      registrationQuestions: [],
      detailModules: [
        {
          id: "module-intro",
          type: "intro",
          displayMode: "rich_text",
          title: { zh: "活动介绍", en: "" },
          content: { zh: "一日滑雪活动。", en: "" },
          items: { zh: [], en: [] },
        },
      ],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      slug: "big-bear-day",
      title: { zh: "大熊山一日滑雪", en: "" },
      eventDate: "2026-12-12",
      meetTime: "07:30",
      registrationQuestions: [],
      detailModules: [{ id: "module-intro", type: "intro" }],
    });
  });

  it("rejects choice questions without Chinese options before parsing succeeds", () => {
    const result = parseEventEditorInput({
      slug: "big-bear-day",
      title: { zh: "大熊山一日滑雪", en: "" },
      capacity: "24",
      registrationQuestions: [
        {
          id: "q1",
          key: "level",
          type: "single_choice",
          required: true,
          label: { zh: "水平", en: "" },
          helpText: { zh: "", en: "" },
          options: { zh: [], en: [] },
        },
      ],
      detailModules: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects choice questions with only blank Chinese options", () => {
    const result = parseEventEditorInput({
      slug: "big-bear-day",
      title: { zh: "大熊山一日滑雪", en: "" },
      capacity: "24",
      registrationQuestions: [
        {
          id: "q1",
          key: "level",
          type: "single_choice",
          required: true,
          label: { zh: "水平", en: "" },
          helpText: { zh: "", en: "" },
          options: { zh: ["   "], en: [] },
        },
      ],
      detailModules: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects participant questions without Chinese labels", () => {
    const result = parseEventEditorInput({
      ...draftInput,
      registrationQuestions: [
        {
          id: "question-name",
          key: "name",
          type: "text",
          required: true,
          label: { zh: "   ", en: "Name" },
          helpText: { zh: "", en: "" },
          options: { zh: [], en: [] },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("requires core Chinese content and one meaningful detail module before publishing", () => {
    const result = parseEventEditorInput({
      slug: "big-bear-day",
      title: { zh: "", en: "" },
      eventDate: "",
      meetTime: "",
      activityLocation: { zh: "", en: "" },
      capacity: "0",
      registrationQuestions: [],
      detailModules: [],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(validatePublishableEvent(result.data)).toEqual(
      expect.arrayContaining([
        "title.zh",
        "eventDate",
        "meetTime",
        "activityLocation.zh",
        "detailModules",
      ]),
    );
  });

  it("requires non-blank Chinese detail module content or items before publishing", () => {
    const result = parseEventEditorInput({
      slug: "big-bear-day",
      title: { zh: "大熊山一日滑雪", en: "" },
      eventDate: "2026-12-12",
      meetTime: "07:30",
      activityLocation: { zh: "Big Bear Mountain Resort", en: "" },
      capacity: "24",
      registrationQuestions: [],
      detailModules: [
        {
          id: "module-notes",
          type: "notes",
          displayMode: "list",
          title: { zh: "注意事项", en: "" },
          content: { zh: "", en: "" },
          items: { zh: ["   "], en: [] },
        },
      ],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(validatePublishableEvent(result.data)).toEqual(
      expect.arrayContaining(["detailModules"]),
    );
  });

  it("requires non-blank Chinese items for list detail modules before publishing", () => {
    const result = parseEventEditorInput({
      slug: "big-bear-day",
      title: { zh: "大熊山一日滑雪", en: "" },
      eventDate: "2026-12-12",
      meetTime: "07:30",
      activityLocation: { zh: "Big Bear Mountain Resort", en: "" },
      capacity: "24",
      registrationQuestions: [],
      detailModules: [
        {
          id: "module-notes",
          type: "notes",
          displayMode: "list",
          title: { zh: "注意事项", en: "" },
          content: { zh: "这段不会在列表模块展示。", en: "" },
          items: { zh: ["   "], en: [] },
        },
      ],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(validatePublishableEvent(result.data)).toEqual(
      expect.arrayContaining(["detailModules"]),
    );
  });

  it("requires non-blank Chinese content for rich text detail modules before publishing", () => {
    const result = parseEventEditorInput({
      slug: "big-bear-day",
      title: { zh: "大熊山一日滑雪", en: "" },
      eventDate: "2026-12-12",
      meetTime: "07:30",
      activityLocation: { zh: "Big Bear Mountain Resort", en: "" },
      capacity: "24",
      registrationQuestions: [],
      detailModules: [
        {
          id: "module-intro",
          type: "intro",
          displayMode: "rich_text",
          title: { zh: "活动介绍", en: "" },
          content: { zh: "", en: "" },
          items: { zh: ["这条不会在富文本模块展示。"], en: [] },
        },
      ],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(validatePublishableEvent(result.data)).toEqual(
      expect.arrayContaining(["detailModules"]),
    );
  });

  it("parses draft editor input into typed defaults", () => {
    const result = parseEventEditorInput(draftInput);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toMatchObject({
      slug: "winter-day",
      status: "draft",
      registrationState: "closed",
      capacity: 24,
      title: { en: "", zh: "" },
      meetLocation: { en: "", zh: "" },
      activityLocation: { en: "", zh: "" },
      registrationQuestions: [
        {
          ...draftInput.registrationQuestions[0],
          helpText: { en: "", zh: "" },
          options: { en: [], zh: [] },
        },
      ],
    });
  });

  it("accepts archived events from the admin editor", () => {
    const result = parseEventEditorInput({
      ...draftInput,
      status: "archived",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe("archived");
  });

  it("rejects invalid url identifiers and numeric values", () => {
    const result = parseEventEditorInput({
      ...draftInput,
      slug: "Winter Day",
      capacity: "-1",
    });

    expect(result.success).toBe(false);
  });

  it("rejects date strings that cannot be parsed", () => {
    const result = parseEventEditorInput({
      ...draftInput,
      registrationCloseAt: "not-a-date",
    });

    expect(result.success).toBe(false);
  });

  it("rejects registration questions that the registration form cannot render", () => {
    const result = parseEventEditorInput({
      ...draftInput,
      registrationQuestions: [
        {
          id: "question-level",
          key: "level",
          label: { en: "Level", zh: "水平" },
          type: "radio",
          required: true,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("lists missing core fields before publishing", () => {
    const parsed = parseEventEditorInput(draftInput);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(validatePublishableEvent(parsed.data)).toEqual(
      expect.arrayContaining([
        "title.zh",
        "activityLocation.zh",
        "detailModules",
      ]),
    );
  });
});
