import { describe, expect, it } from "vitest";
import type { MemberProfile, RegistrationAnswers } from "@/lib/types";
import { defaultMemberEquipment, defaultMemberNotificationPreferences } from "../members/profile-fields";
import { autofillRegistrationAnswers, canSubmitMemberRegistration } from "./member-gate";

const profile: MemberProfile = {
  id: "member-1",
  userId: "user-1",
  displayName: "Rider One",
  email: "rider@example.com",
  phone: "555-0100",
  riderLevel: { en: "", zh: "" },
  riderType: "snowboarder",
  structuredRiderLevel: "advanced",
  homeMountain: "Mammoth",
  bio: "",
  carpoolInterest: true,
  lodgingInterest: false,
  preferredLanguage: "en",
  instagram: "snowforce",
  discord: "rider#1234",
  avatarUrl: "",
  passes: ["ikon", "epic"],
  equipment: { ...defaultMemberEquipment, ownsSnowboard: true },
  savedEventSlugs: [],
  notificationPreferences: defaultMemberNotificationPreferences,
  emergencyContact: "Patrol",
  emergencyPhone: "555-9999",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

describe("member registration gate", () => {
  it("S5-verified-member-can-register", () => {
    expect(canSubmitMemberRegistration({ profile, emailConfirmed: true })).toEqual({
      allowed: true,
      memberId: "member-1",
    });
  });

  it("S5-unverified-member-is-rejected-before-write", () => {
    expect(canSubmitMemberRegistration({ profile, emailConfirmed: false })).toEqual({
      allowed: false,
      error: "Verify your email before using member registration.",
    });
  });

  it("S5-anonymous-registration-policy-is-explicit", () => {
    expect(canSubmitMemberRegistration(null)).toEqual({ allowed: true, memberId: null });
  });

  it("S5-profile-autofill-matches-event-question-keys", () => {
    const existing: RegistrationAnswers = { note: "keep this" };

    expect(autofillRegistrationAnswers(existing, profile)).toEqual({
      note: "keep this",
      name: "Rider One",
      email: "rider@example.com",
      phone: "555-0100",
      riderLevel: "advanced",
      level: "advanced",
      riderType: "snowboarder",
      homeMountain: "Mammoth",
      passes: ["ikon", "epic"],
      pass: ["ikon", "epic"],
      needCarpool: true,
      needLodging: false,
      needsRental: false,
      emergencyContact: "Patrol",
      emergencyPhone: "555-9999",
    });
  });
});
