import { isValidMemberEmail, normalizeMemberEmail, validatePassword } from "./member-validation";

export type MemberEntryMode = "register" | "login";
const riderTypes = ["", "skier", "snowboarder", "both", "learning"] as const;
const riderLevels = ["", "first_timer", "beginner", "intermediate", "advanced", "expert"] as const;
const preferredLanguages = ["en", "zh"] as const;

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function readTrimmed(formData: FormData, key: string) {
  return readString(formData, key).trim();
}

function readBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function readCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isOneOf<T extends readonly string[]>(value: string, values: T): value is T[number] {
  return values.includes(value);
}

export function parseMemberEntry(mode: MemberEntryMode, formData: FormData) {
  const email = normalizeMemberEmail(readString(formData, "email"));
  const displayName = readString(formData, "displayName").trim();
  const password = readString(formData, "password");
  const confirmPassword = readString(formData, "confirmPassword");
  const remember = readBoolean(formData, "remember");

  if (!isValidMemberEmail(email)) {
    return { success: false as const, error: "email" as const };
  }

  if (mode === "register" && !displayName) {
    return { success: false as const, error: "register_fields" as const };
  }

  if (!password || (mode === "register" && !validatePassword(password).valid)) {
    return { success: false as const, error: "password" as const };
  }

  if (mode === "register" && password !== confirmPassword) {
    return { success: false as const, error: "confirm" as const };
  }

  if (mode === "register" && !readBoolean(formData, "privacyPolicyAccepted")) {
    return { success: false as const, error: "privacy_policy" as const };
  }

  return {
    success: true as const,
    email,
    displayName,
    password,
    remember,
    photoSocialMediaConsent: mode === "register",
    privacyPolicyAccepted: readBoolean(formData, "privacyPolicyAccepted"),
    marketingEmailOptIn: readBoolean(formData, "marketingEmailOptIn"),
  };
}

export function parseMemberMagicLink(formData: FormData) {
  return parseMemberEmail(formData);
}

export function parseMemberEmail(formData: FormData) {
  const email = normalizeMemberEmail(readString(formData, "email"));

  if (!isValidMemberEmail(email)) {
    return { success: false as const, error: "email" as const };
  }

  return { success: true as const, email };
}

export function parseMemberPasswordUpdate(formData: FormData) {
  const password = readString(formData, "password");
  const confirmPassword = readString(formData, "confirmPassword");

  if (!validatePassword(password).valid) {
    return { success: false as const, error: "password" as const };
  }

  if (password !== confirmPassword) {
    return { success: false as const, error: "confirm" as const };
  }

  return { success: true as const, password };
}

export function parseMemberProfileUpdate(formData: FormData) {
  const displayName = readTrimmed(formData, "displayName");
  const riderType = readTrimmed(formData, "riderType");
  const riderLevel = readTrimmed(formData, "riderLevel");
  const preferredLanguage = readTrimmed(formData, "preferredLanguage") || "zh";

  if (!displayName) {
    return { success: false as const, error: "displayName" as const };
  }
  if (!isOneOf(riderType, riderTypes)) {
    return { success: false as const, error: "riderType" as const };
  }
  if (!isOneOf(riderLevel, riderLevels)) {
    return { success: false as const, error: "riderLevel" as const };
  }
  if (!isOneOf(preferredLanguage, preferredLanguages)) {
    return { success: false as const, error: "preferredLanguage" as const };
  }

  return {
    success: true as const,
    data: {
      displayName,
      phone: readTrimmed(formData, "phone"),
      riderType,
      structuredRiderLevel: riderLevel,
      homeMountain: readTrimmed(formData, "homeMountain"),
      bio: readTrimmed(formData, "bio"),
      carpoolInterest: readBoolean(formData, "carpoolInterest"),
      lodgingInterest: readBoolean(formData, "lodgingInterest"),
      preferredLanguage,
      instagram: readTrimmed(formData, "instagram").replace(/^@+/, ""),
      discord: readTrimmed(formData, "discord"),
      avatarUrl: readTrimmed(formData, "avatarUrl"),
      passes: readCsv(readString(formData, "passes")),
      equipment: {
        ownsSkis: readBoolean(formData, "ownsSkis"),
        ownsSnowboard: readBoolean(formData, "ownsSnowboard"),
        ownsBoots: readBoolean(formData, "ownsBoots"),
        needsRentalHelp: readBoolean(formData, "needsRentalHelp"),
      },
      emergencyContact: readTrimmed(formData, "emergencyContact"),
      emergencyPhone: readTrimmed(formData, "emergencyPhone"),
    },
  };
}
