import { describe, expect, it } from "vitest";

import type { Event } from "@/lib/types";
import { isEventOpen } from "./availability";

const openEvent: Event = {
  slug: "open-unlimited",
  status: "published",
  registrationState: "open",
  title: { en: "Open", zh: "开放" },
  subtitle: { en: "", zh: "" },
  description: { en: "", zh: "" },
  highlights: { en: [], zh: [] },
  audienceLevel: { en: "", zh: "" },
  schedule: { en: "", zh: "" },
  location: { en: "", zh: "" },
  locationUrl: "",
  feeInfo: { en: "", zh: "" },
  notices: { en: [], zh: [] },
  coverImage: "",
  media: [],
  capacity: 0,
  registrationCount: 42,
  registrationOpenAt: "2020-01-01T00:00:00.000Z",
  registrationCloseAt: "2099-01-01T00:00:00.000Z",
  eventStartAt: "2099-02-01T00:00:00.000Z",
  eventEndAt: "2099-02-01T06:00:00.000Z",
  registrationFields: [],
  tags: { en: [], zh: [] },
  seoTitle: { en: "", zh: "" },
  seoDescription: { en: "", zh: "" },
};

describe("event availability", () => {
  it("keeps registration open for unlimited-capacity events", () => {
    expect(isEventOpen(openEvent)).toBe(true);
  });
});
