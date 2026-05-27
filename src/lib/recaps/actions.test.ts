import { describe, expect, it } from "vitest";

import {
  addMediaItems,
  deleteMediaItem,
  moveMediaItem,
  setCoverMediaItem,
  updateMediaCaption,
} from "./media-helpers";
import { createRecapFromEventResult, unarchiveRecapResult } from "./actions";
import type { Event, EventRecap, RecapMediaItem } from "../types";

function media(id: string, order: number, isCover = false): RecapMediaItem {
  return {
    id,
    type: "image",
    url: `https://example.com/${id}.jpg`,
    storagePath: `recaps/demo/${id}.jpg`,
    order,
    isCover,
  };
}

function eventForRecap(): Event {
  return {
    slug: "demo-event",
    status: "archived",
    registrationState: "closed",
    title: { zh: "活动标题", en: "Event title" },
    eventDate: "2026-01-01",
    meetTime: "08:00",
    meetLocation: { zh: "集合点", en: "Meet point" },
    activityLocation: { zh: "雪场", en: "Resort" },
    locationUrl: "",
    coverImage: "https://example.com/cover.jpg",
    capacity: 12,
    registrationCount: 0,
    registrationCloseAt: "2025-12-31T10:00",
    requiresApproval: false,
    allowWaitlist: true,
    allowCancellation: true,
    feeAmount: "120",
    paymentInstructions: { zh: "付款说明", en: "Payment instructions" },
    seoTitle: { zh: "", en: "" },
    seoDescription: { zh: "", en: "" },
    registrationQuestions: [],
    detailModules: [
      {
        id: "intro",
        type: "intro",
        displayMode: "rich_text",
        title: { zh: "活动概览", en: "Overview" },
        content: { zh: "回顾正文", en: "Recap body" },
        items: { zh: [], en: [] },
      },
    ],
  };
}

function recap(items: RecapMediaItem[]): EventRecap {
  return {
    slug: "demo",
    status: "draft",
    title: { zh: "中文", en: "" },
    summary: { zh: "摘要", en: "" },
    content: { zh: "正文", en: "" },
    date: "2026-01-01",
    location: { zh: "雪场", en: "" },
    coverImage: items.find((item) => item.isCover)?.url ?? "",
    media: items,
    tags: { zh: [], en: [] },
    seoTitle: { zh: "", en: "" },
    seoDescription: { zh: "", en: "" },
    eventSlug: "demo-event",
  };
}

describe("recap media helpers", () => {
  it("adds uploaded media and makes the first image cover when no cover exists", () => {
    const next = addMediaItems(recap([]), [media("a", 0), media("b", 1)]);

    expect(next.media.map((item) => [item.id, item.order, item.isCover])).toEqual([
      ["a", 0, true],
      ["b", 1, false],
    ]);
    expect(next.coverImage).toBe("https://example.com/a.jpg");
  });

  it("deletes cover media and promotes the first remaining image", () => {
    const next = deleteMediaItem(recap([media("a", 0, true), media("b", 1)]), "a");

    expect(next.media.map((item) => [item.id, item.order, item.isCover])).toEqual([["b", 0, true]]);
    expect(next.coverImage).toBe("https://example.com/b.jpg");
  });

  it("moves media by direction and reindexes order", () => {
    const next = moveMediaItem(recap([media("a", 0, true), media("b", 1), media("c", 2)]), "c", "up");

    expect(next.media.map((item) => [item.id, item.order])).toEqual([
      ["a", 0],
      ["c", 1],
      ["b", 2],
    ]);
  });

  it("sets one image as cover", () => {
    const next = setCoverMediaItem(recap([media("a", 0, true), media("b", 1)]), "b");

    expect(next.media.map((item) => [item.id, item.isCover])).toEqual([
      ["a", false],
      ["b", true],
    ]);
    expect(next.coverImage).toBe("https://example.com/b.jpg");
  });

  it("updates optional captions without requiring both languages", () => {
    const next = updateMediaCaption(recap([media("a", 0, true)]), "a", { zh: "合影" });

    expect(next.media[0].caption).toEqual({ zh: "合影" });
  });

  it("makes an existing hidden recap visible when its source event is archived again", async () => {
    const hiddenRecap = { ...recap([]), status: "hidden" as const };
    const saved: Record<string, unknown> = {};

    const result = await createRecapFromEventResult(
      {
        loadRecap: async () => hiddenRecap,
        insertRecap: async () => {
          throw new Error("existing recap should be updated, not inserted");
        },
        saveRecap: async (_slug, data) => {
          saved.recap = data;
          return { ...hiddenRecap, ...data };
        },
      },
      eventForRecap(),
    );

    expect(result?.status).toBe("draft");
    expect(saved.recap).toEqual({ status: "draft" });
  });

  it("restores archived event to draft and hides the recap without deleting media", async () => {
    const recapWithMedia = recap([media("a", 0, true)]);
    const saved: Record<string, unknown> = {};

    const result = await unarchiveRecapResult(
      {
        loadRecap: async () => ({ ...recapWithMedia, status: "published" }),
        saveRecap: async (_slug, data) => {
          saved.recap = data;
          return { ...recapWithMedia, ...data };
        },
        saveEvent: async (_slug, data) => {
          saved.event = data;
          return {};
        },
      },
      "demo",
    );

    expect(result).toEqual({ success: true, eventSlug: "demo-event" });
    expect(saved.event).toEqual({ status: "draft" });
    expect(saved.recap).toEqual({ status: "hidden" });
  });

  it("does not hide the recap when the source event cannot be restored", async () => {
    const recapWithMedia = recap([media("a", 0, true)]);
    const saved: Record<string, unknown> = {};

    const result = await unarchiveRecapResult(
      {
        loadRecap: async () => recapWithMedia,
        saveRecap: async (_slug, data) => {
          saved.recap = data;
          return { ...recapWithMedia, ...data };
        },
        saveEvent: async (_slug, data) => {
          saved.event = data;
          return undefined;
        },
      },
      "demo",
    );

    expect(result).toEqual({ success: false, message: "Source event could not be restored." });
    expect(saved.event).toEqual({ status: "draft" });
    expect(saved.recap).toBeUndefined();
  });
});
