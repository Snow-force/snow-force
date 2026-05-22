import { describe, expect, it } from "vitest";

import type { EventRow, EventWriteRow } from "./mappers";
import { createEventRepository, type EventSource } from "./repository";

function eventRow(slug: string, status: EventRow["status"]): EventRow {
  return {
    slug,
    status,
    registration_state: "closed",
    title_en: slug,
    title_zh: `${slug}-zh`,
    subtitle_en: null,
    subtitle_zh: null,
    description_en: null,
    description_zh: null,
    highlights_en: [],
    highlights_zh: [],
    audience_level_en: null,
    audience_level_zh: null,
    schedule_en: null,
    schedule_zh: null,
    location_en: null,
    location_zh: null,
    location_url: null,
    fee_info_en: null,
    fee_info_zh: null,
    notices_en: [],
    notices_zh: [],
    cover_image: null,
    media: [],
    capacity: 12,
    registration_open_at: null,
    registration_close_at: null,
    event_start_at: null,
    event_end_at: null,
    registration_fields: [],
    tags_en: [],
    tags_zh: [],
    seo_title_en: null,
    seo_title_zh: null,
    seo_description_en: null,
    seo_description_zh: null,
  };
}

function eventSource(rows: EventRow[]): EventSource {
  return {
    listPublic: async () => rows,
    listAdmin: async () => rows,
    getPublic: async (slug) => rows.find((row) => row.slug === slug),
    getAdmin: async (slug) => rows.find((row) => row.slug === slug),
    upsertAdmin: async (row: EventWriteRow) => ({
      ...eventRow(row.slug, row.status),
      ...row,
    }),
  };
}

describe("event repository", () => {
  it("keeps drafts out of public event reads", async () => {
    const repository = createEventRepository(
      eventSource([eventRow("published", "published"), eventRow("draft", "draft")]),
    );

    expect((await repository.getEvents()).map((event) => event.slug)).toEqual(["published"]);
    expect(await repository.getEvent("draft")).toBeUndefined();
    expect((await repository.getAllEvents()).map((event) => event.slug)).toEqual([
      "published",
      "draft",
    ]);
  });
});
