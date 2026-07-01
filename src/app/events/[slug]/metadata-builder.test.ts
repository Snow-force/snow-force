import { describe, expect, it } from "vitest";
import type { Event } from "@/lib/types";

import { buildEventMetadata } from "./metadata-builder";

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    slug: "test-event",
    status: "published",
    registrationState: "open",
    title: { en: "Event Title", zh: "活动标题" },
    eventDate: "2026-07-15",
    meetTime: "09:00",
    meetLocation: { en: "Meeting Point", zh: "集合点" },
    activityLocation: { en: "Resort", zh: "滑雪场" },
    locationUrl: "",
    coverImage: "",
    capacity: 20,
    registrationCount: 0,
    registrationCloseAt: "2026-07-14T18:00:00Z",
    requiresApproval: false,
    allowWaitlist: false,
    allowCancellation: true,
    feeAmount: "0",
    paymentModel: "free",
    depositAmount: null,
    depositCurrency: "usd",
    fullPaymentAmount: null,
    paymentInstructions: { en: "", zh: "" },
    seoTitle: { en: "", zh: "" },
    seoDescription: { en: "", zh: "" },
    registrationQuestions: [],
    detailModules: [],
    ...overrides,
  };
}

describe("buildEventMetadata", () => {
  it("(a) returns full OG/Twitter metadata when event has seoTitle and coverImage", () => {
    const event = makeEvent({
      slug: "tahoe-2026",
      seoTitle: { en: "Tahoe Trip 2026", zh: "太浩湖之旅2026" },
      seoDescription: { en: "Join us", zh: "加入我们" },
      coverImage: "https://img.example/t.jpg",
    });

    const meta = buildEventMetadata(event, "https://snowforce.app");

    expect(meta.title).toBe("Tahoe Trip 2026");
    expect(meta.description).toBe("Join us");
    expect(meta.alternates?.canonical).toBe("https://snowforce.app/events/tahoe-2026");
    expect(meta.openGraph?.url).toBe("https://snowforce.app/events/tahoe-2026");
    expect(meta.openGraph?.images).toEqual([{ url: "https://img.example/t.jpg" }]);
    expect(meta.openGraph?.type).toBe("website");
    expect(meta.twitter?.card).toBe("summary_large_image");
    expect(meta.twitter?.title).toBe("Tahoe Trip 2026");
    expect(meta.twitter?.description).toBe("Join us");
    expect(meta.twitter?.images).toEqual(["https://img.example/t.jpg"]);
  });

  it("(b) falls back to title.en when seoTitle is empty", () => {
    const event = makeEvent({
      seoTitle: { en: "", zh: "" },
      title: { en: "Fallback Title", zh: "后备标题" },
    });

    const meta = buildEventMetadata(event, "https://snowforce.app");

    expect(meta.title).toBe("Fallback Title");
  });

  it("(c) falls back to seoTitle.zh when seoTitle.en is empty", () => {
    const event = makeEvent({
      seoTitle: { en: "", zh: "中文标题" },
      title: { en: "English Fallback", zh: "英文后备" },
    });

    const meta = buildEventMetadata(event, "https://snowforce.app");

    // Chinese seoTitle wins over English event title
    expect(meta.title).toBe("中文标题");
  });

  it("(d) returns not-found metadata when event is undefined", () => {
    const meta = buildEventMetadata(undefined, "https://snowforce.app");

    expect(meta.title).toBe("Event Not Found");
    expect(meta.description).toBeUndefined();
    expect(meta.openGraph).toBeUndefined();
    expect(meta.twitter).toBeUndefined();
  });

  it("(e) omits images when coverImage is empty", () => {
    const event = makeEvent({
      slug: "no-pic",
      seoTitle: { en: "No Pic", zh: "" },
      coverImage: "",
    });

    const meta = buildEventMetadata(event, "https://snowforce.app");

    expect(meta.openGraph?.images).toBeUndefined();
    expect(meta.twitter?.images).toBeUndefined();
  });

  it("(f) returns empty string description when seoDescription is empty", () => {
    const event = makeEvent({
      seoTitle: { en: "Desc Test", zh: "" },
      seoDescription: { en: "", zh: "" },
    });

    const meta = buildEventMetadata(event, "https://snowforce.app");

    expect(meta.description).toBe("");
  });
});
