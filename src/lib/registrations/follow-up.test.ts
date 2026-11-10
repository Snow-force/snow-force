import { describe, expect, it } from "vitest";
import type { Registration } from "@/lib/types";
import { defaultRegistrationFinance } from "./finance";
import { buildRegistrationFollowUps, followUpDraft } from "./follow-up";

function followUpRegistration(id: string, overrides: Partial<Registration> = {}): Registration {
  return {
    id, eventSlug: "winter-trip", memberId: null, answers: {}, consentGiven: true,
    contactName: id, contactEmail: "booker@example.com", contactPhone: "",
    status: "confirmed", attendanceStatus: "unmarked", attendanceSource: null,
    attendanceMarkedAt: null, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

describe("registration follow-up desk", () => {
  const finance = { ...defaultRegistrationFinance, depositAmount: 50, depositStatus: "pending" as const };

  it("gives each attendee one next action, with cancellation and refunds before payment collection", () => {
    const rows = [
      followUpRegistration("cancel", { approvalStatus: "pending", finance }),
      followUpRegistration("refund", { status: "cancelled", finance: { ...finance, settlementStatus: "pending_refund" } }),
      followUpRegistration("approval", { approvalStatus: "pending", finance }),
      followUpRegistration("balance", { finance: { ...finance, settlementStatus: "pending_balance" } }),
      followUpRegistration("deposit", { finance }),
    ];
    expect(buildRegistrationFollowUps(rows, "deposit", ["cancel"]).map(({ registration, kind }) => [registration.id, kind])).toEqual([
      ["cancel", "cancellation"], ["refund", "refund"], ["approval", "approval"], ["balance", "balance"], ["deposit", "deposit"],
    ]);
  });

  it("does not invent payment tasks for free, unknown, cancelled, rejected, waitlisted or unrecorded payments", () => {
    const rows = [followUpRegistration("missing"),
      ...(["cancelled", "waitlist"] as const).map(status => followUpRegistration(status, { status, finance })),
      followUpRegistration("rejected", { approvalStatus: "rejected", finance }),
      followUpRegistration("zero", { finance: { ...finance, depositAmount: 0 } }),
      followUpRegistration("paid", { finance: { ...finance, depositStatus: "paid" } }),
    ];
    expect(buildRegistrationFollowUps(rows, "deposit")).toEqual([]);
    expect(buildRegistrationFollowUps([followUpRegistration("free", { finance })], "free")).toEqual([]);
    expect(buildRegistrationFollowUps([followUpRegistration("unknown", { finance })], undefined)).toEqual([]);
  });

  it("sorts by priority then oldest registration without mutating the input", () => {
    const rows = [followUpRegistration("new", { finance, createdAt: "2026-11-03" }), followUpRegistration("old", { finance })];
    expect(buildRegistrationFollowUps(rows, "deposit").map(r => r.registration.id)).toEqual(["old", "new"]);
    expect(rows[0].id).toBe("new");
  });

  it("drafts for the named attendee without exposing internal notes or promising refunds or approval", () => {
    const row = followUpRegistration("小雪", { finance: { ...finance, paymentNote: "INTERNAL SECRET" } });
    const item = { registration: row, kind: "refund" as const };
    expect(followUpDraft(item, "Winter ride", "en")).toContain("小雪");
    expect(followUpDraft(item, "Winter ride", "en")).toContain("reviewing");
    expect(followUpDraft(item, "雪山行", "zh")).toContain("雪山行");
    expect(followUpDraft(item, "Winter ride", "en")).not.toContain("INTERNAL SECRET");
    for (const kind of ["cancellation", "refund", "approval", "balance", "deposit"] as const) {
      for (const lang of ["en", "zh"] as const) expect(followUpDraft({ registration: row, kind }, "Winter ride", lang)).toContain("小雪");
    }
  });
});
