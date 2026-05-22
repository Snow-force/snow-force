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
