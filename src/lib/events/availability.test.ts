import { describe, expect, it } from "vitest";

import type { Event } from "@/lib/types";
import { createDefaultReviewConfig } from "@/lib/reviews/config";
import { getEventAvailabilitySnapshot, isEventOpen } from "./availability";

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

  it("returns a shared snapshot for finite-capacity event displays", () => {
    const snapshot = getEventAvailabilitySnapshot({
      ...openEvent,
      capacity: 20,
      registrationCount: 7,
    });

    expect(snapshot).toEqual({
      open: true,
      remaining: 13,
      percentFull: 35,
    });
  });

  it("uses detail registration semantics for closed preview snapshots", () => {
    const snapshot = getEventAvailabilitySnapshot({
      ...openEvent,
      capacity: 10,
      registrationCount: 10,
      registrationState: "open",
    });

    expect(snapshot).toEqual({
      open: false,
      remaining: 0,
      percentFull: 100,
    });
  });

  it("keeps unlimited snapshots open without a remaining count or filled progress", () => {
    expect(getEventAvailabilitySnapshot(openEvent)).toEqual({
      open: true,
      remaining: undefined,
      percentFull: 0,
    });
  });
});
