import { describe, expect, it } from "vitest";
import type { EventRecap } from "@/lib/types";

import { createRecapRepository, type RecapRow, type RecapSource } from "./repository";

function domainToRow(data: Partial<EventRecap>): Partial<RecapRow> {
  const row: Partial<RecapRow> = {};
  if (data.status !== undefined) row.status = data.status;
  if (data.title) {
    row.title_en = data.title.en;
    row.title_zh = data.title.zh;
  }
  if (data.summary) {
    row.summary_en = data.summary.en;
    row.summary_zh = data.summary.zh;
  }
  if (data.content) {
    row.content_en = data.content.en;
    row.content_zh = data.content.zh;
  }
  if (data.date !== undefined) row.date = data.date;
  if (data.location) {
    row.location_en = data.location.en;
    row.location_zh = data.location.zh;
  }
  if (data.coverImage !== undefined) row.cover_image = data.coverImage;
  if (data.media !== undefined) row.media = data.media;
  if (data.tags) {
    row.tags_en = data.tags.en;
    row.tags_zh = data.tags.zh;
  }
  if (data.seoTitle) {
    row.seo_title_en = data.seoTitle.en;
    row.seo_title_zh = data.seoTitle.zh;
  }
  if (data.seoDescription) {
    row.seo_description_en = data.seoDescription.en;
    row.seo_description_zh = data.seoDescription.zh;
  }
  if ("eventSlug" in data) row.event_slug = data.eventSlug ?? null;
  return row;
}

function recapRow(slug: string, status: RecapRow["status"], date = "2025-01-01"): RecapRow {
  return {
    slug,
    status,
    title_en: slug,
    title_zh: `${slug}-zh`,
    summary_en: null,
    summary_zh: null,
    content_en: null,
    content_zh: null,
    date,
    location_en: null,
    location_zh: null,
    cover_image: null,
    media: [],
    tags_en: [],
    tags_zh: [],
    seo_title_en: null,
    seo_title_zh: null,
    seo_description_en: null,
    seo_description_zh: null,
    event_slug: null,
  };
}

function recapSource(rows: RecapRow[]): RecapSource {
  return {
    listPublic: async () => rows.filter((row) => row.status === "published"),
    listAdmin: async () => rows,
    getPublic: async (slug) => rows.find((row) => row.slug === slug && row.status === "published"),
    insert: async (recap) => {
      const row: RecapRow = {
        slug: recap.slug,
        status: recap.status,
        title_en: recap.title.en,
        title_zh: recap.title.zh,
        summary_en: recap.summary.en,
        summary_zh: recap.summary.zh,
        content_en: recap.content.en,
        content_zh: recap.content.zh,
        date: recap.date,
        location_en: recap.location.en,
        location_zh: recap.location.zh,
        cover_image: recap.coverImage,
        media: recap.media,
        tags_en: recap.tags.en,
        tags_zh: recap.tags.zh,
        seo_title_en: recap.seoTitle.en,
        seo_title_zh: recap.seoTitle.zh,
        seo_description_en: recap.seoDescription.en,
        seo_description_zh: recap.seoDescription.zh,
        event_slug: recap.eventSlug ?? null,
      };
      rows.push(row);
      return row;
    },
    updateAdmin: async (slug, data) => {
      const index = rows.findIndex((row) => row.slug === slug);
      if (index === -1) return undefined;
      rows[index] = { ...rows[index], ...domainToRow(data) };
      return rows[index];
    },
  };
}

describe("recap repository", () => {
  it("keeps drafts out of public recap reads while admin sees all rows", async () => {
    const repository = createRecapRepository(
      recapSource([recapRow("published", "published"), recapRow("draft", "draft")]),
    );

    expect((await repository.getRecaps()).map((recap) => recap.slug)).toEqual(["published"]);
    expect(await repository.getRecap("draft")).toBeUndefined();
    expect((await repository.getAllRecaps()).map((recap) => recap.slug)).toEqual([
      "published",
      "draft",
    ]);
  });

  it("inserts recaps with source event linkage", async () => {
    const repository = createRecapRepository(recapSource([]));

    const inserted = await repository.insertRecap({
      slug: "opening-day-recap",
      status: "draft",
      title: { en: "Opening Day", zh: "开板日" },
      summary: { en: "Season opener", zh: "雪季开板" },
      content: { en: "Photos and story", zh: "照片和故事" },
      date: "2026-01-10",
      location: { en: "Whistler", zh: "惠斯勒" },
      coverImage: "/images/opening.jpg",
      media: [],
      tags: { en: ["snow"], zh: ["滑雪"] },
      seoTitle: { en: "Opening Day", zh: "开板日" },
      seoDescription: { en: "Opening day recap", zh: "开板日回顾" },
      eventSlug: "opening-day",
    });

    expect(inserted).toMatchObject({
      slug: "opening-day-recap",
      status: "draft",
      eventSlug: "opening-day",
    });
    expect((await repository.getAllRecaps()).map((recap) => recap.eventSlug)).toEqual([
      "opening-day",
    ]);
    expect(await repository.getRecap("opening-day-recap")).toBeUndefined();
  });

  it("persists edited recap media and publish state", async () => {
    const repository = createRecapRepository(recapSource([recapRow("opening-day", "draft")]));

    await repository.updateRecap("opening-day", {
      status: "published",
      media: [
        {
          id: "img-1",
          type: "image",
          url: "https://example.com/opening-day.jpg",
          storagePath: "",
          caption: { en: "Group photo", zh: "合影" },
          order: 0,
          isCover: true,
        },
      ],
    });

    const publicRecap = await repository.getRecap("opening-day");
    expect(publicRecap).toMatchObject({
      slug: "opening-day",
      status: "published",
      media: [
        {
          url: "https://example.com/opening-day.jpg",
          caption: { en: "Group photo", zh: "合影" },
        },
      ],
    });
  });

  it("keeps hidden recaps out of public and default admin lists", async () => {
    const repository = createRecapRepository(
      recapSource([
        recapRow("published", "published"),
        recapRow("draft", "draft"),
        recapRow("hidden", "hidden"),
      ]),
    );

    expect((await repository.getRecaps()).map((recap) => recap.slug)).toEqual(["published"]);
    expect((await repository.getAllRecaps()).map((recap) => recap.slug)).toEqual(["published", "draft"]);
    expect((await repository.getAllRecaps({ includeHidden: true })).map((recap) => recap.slug)).toEqual([
      "published",
      "draft",
      "hidden",
    ]);
    expect((await repository.getRecapAdmin("hidden"))?.slug).toEqual("hidden");
  });

  it("persists intentional empty cover image updates", async () => {
    const repository = createRecapRepository(
      recapSource([{ ...recapRow("clear-cover", "draft"), cover_image: "https://example.com/old.jpg" }]),
    );

    await repository.updateRecap("clear-cover", { coverImage: "" });

    expect((await repository.getRecapAdmin("clear-cover"))?.coverImage).toBe("");
  });

  it("normalizes legacy media rows into editable media items", async () => {
    const repository = createRecapRepository(
      recapSource([
        {
          ...recapRow("legacy-media", "draft"),
          media: [
            {
              url: "https://example.com/photo.jpg",
              caption: { zh: "合影", en: "" },
            },
          ],
        },
      ]),
    );

    const adminRecap = await repository.getRecapAdmin("legacy-media");
    expect(adminRecap?.media).toEqual([
      {
        id: "legacy-media-0",
        type: "image",
        url: "https://example.com/photo.jpg",
        storagePath: "",
        caption: { zh: "合影", en: "" },
        order: 0,
        isCover: true,
      },
    ]);
  });

  it("promotes first valid media item as cover when first item is malformed", async () => {
    const repository = createRecapRepository(
      recapSource([
        {
          ...recapRow("test", "draft"),
          media: [
            { url: "" },
            { url: "https://example.com/valid.jpg", caption: { en: "Valid" } },
          ],
        },
      ]),
    );

    const recap = await repository.getRecapAdmin("test");
    expect(recap?.media).toHaveLength(1);
    expect(recap?.media[0]).toMatchObject({
      url: "https://example.com/valid.jpg",
      isCover: true,
    });
  });

  it("drops array and malformed caption values", async () => {
    const repository = createRecapRepository(
      recapSource([
        {
          ...recapRow("test", "draft"),
          media: [
            { url: "https://example.com/a.jpg", caption: ["not", "an", "object"] },
            { url: "https://example.com/b.jpg", caption: { en: 123, zh: null } },
            { url: "https://example.com/c.jpg", caption: { en: "hello" } },
          ],
        },
      ]),
    );

    const recap = await repository.getRecapAdmin("test");
    expect(recap?.media[0].caption).toBeUndefined();
    expect(recap?.media[1].caption).toBeUndefined();
    expect(recap?.media[2].caption).toEqual({ en: "hello" });
  });

  it("mocks updateAdmin with mapped coverImage and eventSlug fields", async () => {
    const repository = createRecapRepository(recapSource([recapRow("test", "draft")]));

    await repository.updateRecap("test", {
      coverImage: "/images/new-cover.jpg",
      eventSlug: "some-event",
    });

    const recap = await repository.getRecapAdmin("test");
    expect(recap?.coverImage).toEqual("/images/new-cover.jpg");
    expect(recap?.eventSlug).toEqual("some-event");
  });
});
