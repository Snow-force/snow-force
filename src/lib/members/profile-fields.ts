import type { MemberProfile } from "@/lib/types";

export type StructuredMemberProfileRow = {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  phone: string | null;
  rider_level_en: string | null;
  rider_level_zh: string | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
  rider_type: string | null;
  rider_level: string | null;
  home_mountain: string | null;
  bio: string | null;
  carpool_interest: boolean | null;
  lodging_interest: boolean | null;
  preferred_language: string | null;
  instagram: string | null;
  discord: string | null;
  avatar_url: string | null;
  passes: string[] | null;
  equipment: unknown;
  saved_event_slugs: string[] | null;
  notification_preferences: unknown;
  created_at: string;
  updated_at: string;
};

export const defaultMemberEquipment = {
  ownsSkis: false,
  ownsSnowboard: false,
  ownsBoots: false,
  needsRentalHelp: false,
};

export const defaultMemberNotificationPreferences = {
  eventReminders: true,
  newTrips: true,
  recapPosted: true,
  communityUpdates: false,
};

const riderTypes = ["", "skier", "snowboarder", "both", "learning"] as const;
const riderLevels = ["", "first_timer", "beginner", "intermediate", "advanced", "expert"] as const;

type MemberEquipment = typeof defaultMemberEquipment;
type MemberNotificationPreferences = typeof defaultMemberNotificationPreferences;

type MemberProfileUpdate = Partial<
  Pick<
    MemberProfile,
    | "displayName"
    | "phone"
    | "riderType"
    | "structuredRiderLevel"
    | "homeMountain"
    | "bio"
    | "carpoolInterest"
    | "lodgingInterest"
    | "preferredLanguage"
    | "instagram"
    | "discord"
    | "avatarUrl"
    | "passes"
    | "equipment"
    | "savedEventSlugs"
    | "notificationPreferences"
    | "emergencyContact"
    | "emergencyPhone"
  >
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeEquipment(value: unknown): MemberEquipment {
  if (!isRecord(value)) return defaultMemberEquipment;
  return {
    ownsSkis: value.ownsSkis === true,
    ownsSnowboard: value.ownsSnowboard === true,
    ownsBoots: value.ownsBoots === true,
    needsRentalHelp: value.needsRentalHelp === true,
  };
}

function normalizeNotificationPreferences(value: unknown): MemberNotificationPreferences {
  if (!isRecord(value)) return defaultMemberNotificationPreferences;
  return {
    eventReminders: typeof value.eventReminders === "boolean" ? value.eventReminders : true,
    newTrips: typeof value.newTrips === "boolean" ? value.newTrips : true,
    recapPosted: typeof value.recapPosted === "boolean" ? value.recapPosted : true,
    communityUpdates: value.communityUpdates === true,
  };
}

function normalizeStringArray(value: string[] | null) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())));
}

function normalizeRiderType(value: string | null): MemberProfile["riderType"] {
  const candidate = value ?? "";
  return riderTypes.includes(candidate as MemberProfile["riderType"]) ? candidate as MemberProfile["riderType"] : "";
}

function normalizeStructuredRiderLevel(value: string | null): MemberProfile["structuredRiderLevel"] {
  const candidate = value ?? "";
  return riderLevels.includes(candidate as MemberProfile["structuredRiderLevel"]) ? candidate as MemberProfile["structuredRiderLevel"] : "";
}

export function normalizeMemberProfileRow(row: StructuredMemberProfileRow): MemberProfile {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone ?? "",
    riderLevel: { en: row.rider_level_en ?? "", zh: row.rider_level_zh ?? "" },
    riderType: normalizeRiderType(row.rider_type),
    structuredRiderLevel: normalizeStructuredRiderLevel(row.rider_level),
    homeMountain: row.home_mountain ?? "",
    bio: row.bio ?? "",
    carpoolInterest: row.carpool_interest ?? false,
    lodgingInterest: row.lodging_interest ?? false,
    preferredLanguage: row.preferred_language === "en" ? "en" : "zh",
    instagram: row.instagram ?? "",
    discord: row.discord ?? "",
    avatarUrl: row.avatar_url ?? "",
    passes: normalizeStringArray(row.passes),
    equipment: normalizeEquipment(row.equipment),
    savedEventSlugs: normalizeStringArray(row.saved_event_slugs),
    notificationPreferences: normalizeNotificationPreferences(row.notification_preferences),
    emergencyContact: row.emergency_contact ?? "",
    emergencyPhone: row.emergency_phone ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function profileUpdateToRow(data: MemberProfileUpdate) {
  return Object.fromEntries(
    Object.entries({
      display_name: data.displayName,
      phone: data.phone,
      rider_type: data.riderType,
      rider_level: data.structuredRiderLevel,
      home_mountain: data.homeMountain,
      bio: data.bio,
      carpool_interest: data.carpoolInterest,
      lodging_interest: data.lodgingInterest,
      preferred_language: data.preferredLanguage,
      instagram: data.instagram,
      discord: data.discord,
      avatar_url: data.avatarUrl,
      passes: data.passes,
      equipment: data.equipment,
      saved_event_slugs: data.savedEventSlugs,
      notification_preferences: data.notificationPreferences,
      emergency_contact: data.emergencyContact,
      emergency_phone: data.emergencyPhone,
    }).filter(([, value]) => value !== undefined),
  );
}

export function toggleSavedEventSlug(current: string[], eventSlug: string) {
  const unique = Array.from(new Set(current));
  return unique.includes(eventSlug)
    ? unique.filter((slug) => slug !== eventSlug)
    : [...unique, eventSlug];
}
