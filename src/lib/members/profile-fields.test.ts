import { describe, expect, it } from "vitest";
import {
  defaultMemberEquipment,
  defaultMemberNotificationPreferences,
  normalizeMemberProfileRow,
  profileUpdateToRow,
  toggleSavedEventSlug,
  type StructuredMemberProfileRow,
} from "./profile-fields";

const baseRow: StructuredMemberProfileRow = {
  id: "profile-1",
  user_id: "user-1",
  display_name: "Rider One",
  email: "rider@example.com",
  phone: null,
  rider_level_en: "Advanced legacy",
  rider_level_zh: "高级",
  emergency_contact: null,
  emergency_phone: null,
  rider_type: null,
  rider_level: null,
  home_mountain: null,
  bio: null,
  carpool_interest: null,
  lodging_interest: null,
  preferred_language: null,
  instagram: null,
  discord: null,
  avatar_url: null,
  passes: null,
  equipment: null,
  saved_event_slugs: null,
  notification_preferences: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

describe("structured member profile fields", () => {
  it("S3-profile-row-maps-defaults", () => {
    expect(normalizeMemberProfileRow(baseRow)).toEqual({
      id: "profile-1",
      userId: "user-1",
      displayName: "Rider One",
      email: "rider@example.com",
      phone: "",
      riderLevel: { en: "Advanced legacy", zh: "高级" },
      riderType: "",
      structuredRiderLevel: "",
      homeMountain: "",
      bio: "",
      carpoolInterest: false,
      lodgingInterest: false,
      preferredLanguage: "zh",
      instagram: "",
      discord: "",
      avatarUrl: "",
      passes: [],
      equipment: defaultMemberEquipment,
      savedEventSlugs: [],
      notificationPreferences: defaultMemberNotificationPreferences,
      emergencyContact: "",
      emergencyPhone: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("S3-profile-update-payload-excludes-undefined", () => {
    expect(
      profileUpdateToRow({
        displayName: "Rider Two",
        phone: "555-0100",
        riderType: "skier",
        structuredRiderLevel: "intermediate",
        preferredLanguage: "en",
        passes: ["ikon"],
        equipment: { ...defaultMemberEquipment, ownsSkis: true },
      }),
    ).toEqual({
      display_name: "Rider Two",
      phone: "555-0100",
      rider_type: "skier",
      rider_level: "intermediate",
      preferred_language: "en",
      passes: ["ikon"],
      equipment: { ...defaultMemberEquipment, ownsSkis: true },
    });
  });

  it("S3-profile-saved-events-toggle-is-idempotent", () => {
    expect(toggleSavedEventSlug(["trip-a"], "trip-a")).toEqual([]);
    expect(toggleSavedEventSlug(["trip-a"], "trip-b")).toEqual(["trip-a", "trip-b"]);
    expect(toggleSavedEventSlug(["trip-a", "trip-a"], "trip-b")).toEqual(["trip-a", "trip-b"]);
  });
});
