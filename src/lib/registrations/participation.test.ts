import { describe, expect, it } from "vitest";
import type { PendingRegistration } from "./pending-repository";
import { belongsToBooker, hasActiveSelfRegistration, pendingParticipantIdentity } from "./participation";
import { validateRegistrationAnswers } from "./validation";
import type { Registration } from "@/lib/types";

const pending: PendingRegistration = { id: "pending", memberId: "payer", eventSlug: "event", answers: {},
  consentGiven: true, contactEmail: "payer@example.test", contactName: "Friend", contactPhone: "", tokenHash: "hash",
  expiresAt: "2099-01-01", createdAt: "2026-10-22" };

describe("participant identity", () => {
  it("never binds a friend to the payer account, even when they share an email", () => {
    expect(pendingParticipantIdentity({ ...pending, registrationKind: "proxy" })).toEqual({
      memberId: null, bookerMemberId: "payer", registrationKind: "proxy", attendeeEmail: null,
      attendeeConfirmationStatus: "pending", clientRequestKey: "pending", pendingRegistrationId: "pending",
    });
  });
  it("preserves legacy self registration and verified-member duplicate detection", () => {
    const identity = pendingParticipantIdentity(pending);
    expect(identity).toMatchObject({ memberId: "payer", bookerMemberId: "payer", attendeeEmail: pending.contactEmail });
    const row: Registration = { ...pending, ...identity, status: "cancelled", attendanceStatus: "unmarked", attendanceSource: null, attendanceMarkedAt: null, updatedAt: pending.createdAt };
    expect(hasActiveSelfRegistration([row], "payer")).toBe(false);
    expect(hasActiveSelfRegistration([{ ...row, status: "confirmed" }], "payer")).toBe(true);
    expect(belongsToBooker({ ...row, memberId: null }, "payer")).toBe(true);
    expect(belongsToBooker(row, "other")).toBe(false);
  });
  it("allows optional friend email without weakening self email validation", () => {
    expect(validateRegistrationAnswers([], { name: "Friend" }, "proxy").success).toBe(true);
    expect(validateRegistrationAnswers([], { name: "Friend", email: "bad" }, "proxy").success).toBe(false);
    expect(validateRegistrationAnswers([], { name: "Self" }).success).toBe(false);
    expect(validateRegistrationAnswers([], {}, "proxy").success).toBe(false);
  });
});
