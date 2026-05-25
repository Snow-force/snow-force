import { describe, expect, it } from "vitest";

import { parseEventEditorInput, validatePublishableEvent } from "./validation";

const draftInput = {
  slug: "winter-day",
  capacity: "24",
  eventStartAt: "2026-12-03T10:00",
  eventEndAt: "2026-12-03T16:00",
  registrationOpenAt: "2026-11-01T09:00",
  registrationCloseAt: "2026-12-02T18:00",
  registrationFields: [
    {
      key: "name",
      label: { en: "Name", zh: "姓名" },
      type: "text",
      required: true,
    },
  ],
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
    });
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
      highlights: { en: [], zh: [] },
      registrationFields: draftInput.registrationFields,
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

  it("rejects invalid url identifiers and editor ranges", () => {
    const result = parseEventEditorInput({
      ...draftInput,
      slug: "Winter Day",
      capacity: "-1",
      eventEndAt: "2026-12-03T09:00",
      registrationCloseAt: "2026-10-31T18:00",
    });

    expect(result.success).toBe(false);
  });

  it("rejects date strings that cannot be parsed", () => {
    const result = parseEventEditorInput({
      ...draftInput,
      eventStartAt: "not-a-date",
    });

    expect(result.success).toBe(false);
  });

  it("rejects registration fields that the registration form cannot render", () => {
    const result = parseEventEditorInput({
      ...draftInput,
      registrationFields: [
        {
          key: "level",
          label: { en: "Level", zh: "水平" },
          type: "radio",
          required: true,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("lists missing bilingual and operational fields before publishing", () => {
    const parsed = parseEventEditorInput(draftInput);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(validatePublishableEvent(parsed.data)).toEqual(
      expect.arrayContaining([
        "title.en",
        "title.zh",
        "description.en",
        "description.zh",
        "location.en",
        "location.zh",
      ]),
    );
  });
});
