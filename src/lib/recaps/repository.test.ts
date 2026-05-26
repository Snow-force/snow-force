import { describe, expect, it } from "vitest";

import { createRecapRepository, type RecapRow, type RecapSource } from "./repository";

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
      rows[index] = { ...rows[index], ...data };
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
          url: "https://example.com/opening-day.jpg",
          caption: { en: "Group photo", zh: "合影" },
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
});
