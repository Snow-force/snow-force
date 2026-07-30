import { describe, expect, it } from "vitest";

import type { EventQrCampaign } from "@/lib/types";
import { evaluateQrAccess } from "./access-policy";

function campaign(purpose: "checkin" | "review"): EventQrCampaign {
  return {
    id: "campaign-1",
    eventSlug: "event-1",
    purpose,
    accessCode: "code",
    status: "open",
    openedAt: "2026-07-29T18:00:00.000Z",
    closesAt: "2026-07-29T20:00:00.000Z",
    closedAt: null,
    reviewConfigSnapshot: null,
    createdAt: "2026-07-29T18:00:00.000Z",
    updatedAt: "2026-07-29T18:00:00.000Z",
  };
}

const now = new Date("2026-07-29T19:00:00.000Z");

describe("QR access policy", () => {
  it("allows Check-in for a confirmed registration before attendance is marked", () => {
    expect(
      evaluateQrAccess({
        campaign: campaign("checkin"),
        expectedPurpose: "checkin",
        registration: { attendanceStatus: "unmarked" },
        now,
      }),
    ).toBe("accepted");
  });

  it("requires attended status for Review access", () => {
    expect(
      evaluateQrAccess({
        campaign: campaign("review"),
        expectedPurpose: "review",
        registration: { attendanceStatus: "unmarked" },
        now,
      }),
    ).toBe("not_attended");
    expect(
      evaluateQrAccess({
        campaign: campaign("review"),
        expectedPurpose: "review",
        registration: { attendanceStatus: "attended" },
        now,
      }),
    ).toBe("accepted");
  });

  it("never treats a Review QR as a Check-in QR", () => {
    expect(
      evaluateQrAccess({
        campaign: campaign("review"),
        expectedPurpose: "checkin",
        registration: { attendanceStatus: "unmarked" },
        now,
      }),
    ).toBe("wrong_purpose");
  });

  it("honors an already-issued Review grant during its grace period", () => {
    const closed = { ...campaign("review"), status: "closed" as const };
    expect(
      evaluateQrAccess({
        campaign: closed,
        expectedPurpose: "review",
        registration: { attendanceStatus: "attended" },
        existingAccessExpiresAt: "2026-07-29T19:10:00.000Z",
        now,
      }),
    ).toBe("accepted");
    expect(
      evaluateQrAccess({
        campaign: closed,
        expectedPurpose: "review",
        registration: { attendanceStatus: "attended" },
        existingAccessExpiresAt: "2026-07-29T18:59:00.000Z",
        now,
      }),
    ).toBe("not_open");
  });
});
