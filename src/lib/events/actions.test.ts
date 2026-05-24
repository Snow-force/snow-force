import { describe, expect, it } from "vitest";

import { archiveEventResult, publishEventResult } from "./actions";
import { parseEventEditorInput } from "./validation";

describe("event admin action helpers", () => {
  it("returns missing fields instead of publishing incomplete events", async () => {
    const parsed = parseEventEditorInput({
      slug: "draft-event",
      capacity: 12,
      eventStartAt: "2026-12-03T10:00",
      eventEndAt: "2026-12-03T16:00",
      registrationOpenAt: "2026-11-01T10:00",
      registrationCloseAt: "2026-12-02T10:00",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const result = await publishEventResult(
      {
        load: async () => parsed.data,
        save: async () => {
          throw new Error("incomplete events must not be saved");
        },
      },
      "draft-event",
    );

    expect(result).toMatchObject({
      success: false,
      missingFields: expect.arrayContaining(["title.en", "description.zh"]),
    });
  });

  it("archives existing events", async () => {
    const parsed = parseEventEditorInput({
      slug: "past-event",
      status: "published",
      capacity: 12,
      eventStartAt: "2026-12-03T10:00",
      eventEndAt: "2026-12-03T16:00",
      registrationOpenAt: "2026-11-01T10:00",
      registrationCloseAt: "2026-12-02T10:00",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const result = await archiveEventResult(
      {
        load: async () => parsed.data,
        save: async (_slug, data) => ({ ...parsed.data, ...data }),
      },
      "past-event",
    );

    expect(result).toMatchObject({
      success: true,
      event: { status: "archived", registrationState: "closed" },
    });
  });
});
