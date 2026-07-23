/**
 * Merchant form entry parsers.
 *
 * Mirrors `src/lib/members/member-entry.ts` but operates on the
 * merchant-portal vocabulary (business name, contact name, etc.) so the
 * merchant flow stays syntactically separate from the rider/member flow. The
 * parsers return a discriminated union so the caller never has to inspect
 * a `null`/error shape and cannot accidentally treat a parsed merchant entry
 * as a parsed member entry.
 */

export type MerchantEntryMode = "register" | "login";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const preferredLanguages = ["en", "zh"] as const;

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function readTrimmed(formData: FormData, key: string): string {
  return readString(formData, key).trim();
}

function readBoolean(formData: FormData, key: string): boolean {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function isOneOf<T extends readonly string[]>(value: string, values: T): value is T[number] {
  return values.includes(value);
}

export function parseMerchantEntry(
  mode: MerchantEntryMode,
  formData: FormData,
):
  | { success: true; email: string; contactName: string; businessName: string; category: string; password: string; remember: boolean }
  | { success: false; error: "email" | "password" | "register_fields" | "business_name" | "category" } {
  const email = readString(formData, "email").trim().toLowerCase();
  const contactName = readString(formData, "contactName").trim();
  const businessName = readString(formData, "businessName").trim();
  const category = readTrimmed(formData, "category");
  const password = readString(formData, "password");
  const remember = readBoolean(formData, "remember");

  if (!emailPattern.test(email)) {
    return { success: false, error: "email" };
  }

  if (!password) {
    return { success: false, error: "password" };
  }

  if (mode === "register") {
    if (!contactName) {
      return { success: false, error: "register_fields" };
    }
    if (!businessName) {
      return { success: false, error: "business_name" };
    }
    if (!category) {
      return { success: false, error: "category" };
    }
  }

  return { success: true, email, contactName, businessName, category, password, remember };
}

export function parseMerchantMagicLink(
  formData: FormData,
): { success: true; email: string } | { success: false; error: "email" } {
  return parseMerchantEmail(formData);
}

export function parseMerchantEmail(
  formData: FormData,
): { success: true; email: string } | { success: false; error: "email" } {
  const email = readString(formData, "email").trim().toLowerCase();
  if (!emailPattern.test(email)) {
    return { success: false, error: "email" };
  }
  return { success: true, email };
}

export function parseMerchantPasswordUpdate(
  formData: FormData,
): { success: true; password: string } | { success: false; error: "password" | "confirm" } {
  const password = readString(formData, "password");
  const confirmPassword = readString(formData, "confirmPassword");

  if (password.length < 6) {
    return { success: false, error: "password" };
  }
  if (password !== confirmPassword) {
    return { success: false, error: "confirm" };
  }
  return { success: true, password };
}

export type MerchantProfileUpdate = {
  businessName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  category: string;
  description: string;
  preferredLanguage: "en" | "zh";
};

export function parseMerchantProfileUpdate(
  formData: FormData,
):
  | { success: true; data: MerchantProfileUpdate }
  | {
      success: false;
      error: "businessName" | "contactName" | "contactEmail" | "category" | "preferredLanguage";
    } {
  const businessName = readTrimmed(formData, "businessName");
  const contactName = readTrimmed(formData, "contactName");
  const contactEmail = readTrimmed(formData, "contactEmail").toLowerCase();
  const contactPhone = readTrimmed(formData, "contactPhone");
  const category = readTrimmed(formData, "category");
  const description = readTrimmed(formData, "description");
  const preferredLanguage = readTrimmed(formData, "preferredLanguage") || "zh";

  if (!businessName) {
    return { success: false, error: "businessName" };
  }
  if (!contactName) {
    return { success: false, error: "contactName" };
  }
  if (!emailPattern.test(contactEmail)) {
    return { success: false, error: "contactEmail" };
  }
  if (!category) {
    return { success: false, error: "category" };
  }
  if (!isOneOf(preferredLanguage, preferredLanguages)) {
    return { success: false, error: "preferredLanguage" };
  }

  return {
    success: true,
    data: {
      businessName,
      contactName,
      contactEmail,
      contactPhone,
      category,
      description,
      preferredLanguage,
    },
  };
}
