import { describe, expect, it } from "vitest";

import type { Event } from "@/lib/types";
import { createDefaultReviewConfig } from "@/lib/reviews/config";
import { selectPublicDisplayEvents } from "./public-display";

function event(overrides: Partial<Event> = {}): Event {
  return {
    slug: "event",
    status: "published",
    registrationState: "open",
    title: { en: "Event", zh: "活动" },
    eventDate: "2026-12-01",
    meetTime: "08:00",
    meetLocation: { en: "", zh: "" },
    activityLocation: { en: "", zh: "" },
    locationUrl: "",
    coverImage: "",
    capacity: 20,
    registrationCount: 0,
    registrationCloseAt: "",
    requiresApproval: false,
    allowWaitlist: false,
    allowCancellation: false,
    feeAmount: "",
    paymentModel: "free",
    depositAmount: null,
    depositCurrency: "usd",
    fullPaymentAmount: null,
    paymentInstructions: { en: "", zh: "" },
    seoTitle: { en: "", zh: "" },
    seoDescription: { en: "", zh: "" },
    registrationQuestions: [],
    detailModules: [],
    waiverTextEn: null,
    waiverTextSha: null,
    merchantBoothProgram: null,
    reviewConfig: createDefaultReviewConfig(),
    ...overrides,
  };
}

describe("selectPublicDisplayEvents", () => {
  it("excludes closed, draft, and archived activities", () => {
    const events = [
      event({ slug: "open" }),
      event({ slug: "closed", registrationState: "closed" }),
      event({ slug: "draft", status: "draft" }),
      event({ slug: "archived", status: "archived" }),
    ];

    expect(selectPublicDisplayEvents(events).map(({ slug }) => slug)).toEqual(["open"]);
  });

  it("keeps explicitly full and capacity-full activities after activities with capacity", () => {
    const events = [
      event({ slug: "explicit-full", registrationState: "full", eventDate: "2026-11-01" }),
      event({ slug: "capacity-full", registrationCount: 20, eventDate: "2026-10-01" }),
      event({ slug: "open", eventDate: "2026-12-01" }),
    ];

    expect(selectPublicDisplayEvents(events).map(({ slug }) => slug)).toEqual([
      "open",
      "capacity-full",
      "explicit-full",
    ]);
  });

  it("sorts each availability group by date, then puts missing dates last with slug tie-breaks", () => {
    const events = [
      event({ slug: "open-late", eventDate: "2026-12-03" }),
      event({ slug: "open-no-date-z", eventDate: "" }),
      event({ slug: "open-no-date-a", eventDate: "not-a-date" }),
      event({ slug: "open-early-b", eventDate: "2026-12-01" }),
      event({ slug: "open-early-a", eventDate: "2026-12-01" }),
      event({ slug: "full-late", registrationState: "full", eventDate: "2026-12-04" }),
      event({ slug: "full-early", registrationState: "full", eventDate: "2026-12-02" }),
      event({ slug: "full-no-date", registrationState: "full", eventDate: "" }),
    ];

    expect(selectPublicDisplayEvents(events).map(({ slug }) => slug)).toEqual([
      "open-early-a",
      "open-early-b",
      "open-late",
      "open-no-date-a",
      "open-no-date-z",
      "full-early",
      "full-late",
      "full-no-date",
    ]);
  });
});
