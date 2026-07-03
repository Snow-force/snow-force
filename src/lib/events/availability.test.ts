import { describe, expect, it } from "vitest";

import type { Event } from "@/lib/types";
import { isEventOpen } from "./availability";

const openEvent: Event = {
  slug: "open-unlimited",
  status: "published",
  registrationState: "open",
  title: { en: "Open", zh: "Open" },
  eventDate: "2099-02-01",
  meetTime: "08:00",
  meetLocation: { en: "", zh: "" },
  activityLocation: { en: "Big Bear", zh: "Big Bear" },
  locationUrl: "",
  coverImage: "",
  capacity: 0,
  registrationCount: 42,
  registrationCloseAt: "2099-01-01T00:00:00.000Z",
  requiresApproval: false,
  allowWaitlist: true,
  allowCancellation: true,
  feeAmount: "",
  paymentInstructions: { en: "", zh: "" },
  seoTitle: { en: "", zh: "" },
  seoDescription: { en: "", zh: "" },
  registrationQuestions: [],
  detailModules: [],
  waiverTextEn: null,
  waiverTextSha: null,
};

describe("event availability", () => {
  it("keeps registration open for unlimited-capacity events", () => {
    expect(isEventOpen(openEvent)).toBe(true);
  });

  it("keeps closed registration states closed", () => {
    expect(isEventOpen({ ...openEvent, registrationState: "closed" })).toBe(false);
  });

  it("keeps full registration states closed", () => {
    expect(isEventOpen({ ...openEvent, registrationState: "full" })).toBe(false);
  });
});
