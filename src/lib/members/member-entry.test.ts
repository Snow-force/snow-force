import { describe, expect, it } from "vitest";
import {
  parseMemberEmail,
  parseMemberEntry,
  parseMemberMagicLink,
  parseMemberPasswordUpdate,
  parseMemberProfileUpdate,
} from "./member-entry";
import { isValidMemberEmail, validatePassword } from "./member-validation";

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

describe("parseMemberEntry", () => {
  it("normalizes valid login email", () => {
    const result = parseMemberEntry(
      "login",
      form({ email: " Rider@Example.COM ", password: "secret123" }),
    );

    expect(result).toEqual({
      success: true,
      email: "rider@example.com",
      displayName: "",
      password: "secret123",
      remember: false,
      photoSocialMediaConsent: false,
      marketingEmailOptIn: false,
      privacyPolicyAccepted: false,
    });
  });

  it("normalizes remember me for login", () => {
    const result = parseMemberEntry(
      "login",
      form({ email: "rider@example.com", password: "secret123", remember: "on" }),
    );

    expect(result).toMatchObject({ success: true, remember: true });
  });

  it("requires display name for registration", () => {
    const result = parseMemberEntry(
      "register",
      form({ email: "rider@example.com", password: "secret123" }),
    );

    expect(result).toEqual({ success: false, error: "register_fields" });
  });

  it("returns the normalized registration entry without confirmation password", () => {
    const result = parseMemberEntry(
      "register",
      form({
        displayName: " Rider One ",
        email: " Rider@Example.COM ",
        password: "Secret123",
        confirmPassword: "Secret123",
        photoSocialMediaConsent: "on",
        marketingEmailOptIn: "on",
        privacyPolicyAccepted: "on",
      }),
    );

    expect(result).toEqual({
      success: true,
      email: "rider@example.com",
      displayName: "Rider One",
      password: "Secret123",
      remember: false,
      photoSocialMediaConsent: true,
      marketingEmailOptIn: true,
      privacyPolicyAccepted: true,
    });
    expect(result).not.toHaveProperty("confirmPassword");
  });

  it("requires one privacy acceptance and records the included event-media permission", () => {
    expect(parseMemberEntry("register", form({
      displayName: "Rider One",
      email: "rider@example.com",
      password: "Secret123",
      confirmPassword: "Secret123",
      privacyPolicyAccepted: "on",
    }))).toMatchObject({
      success: true,
      photoSocialMediaConsent: true,
      privacyPolicyAccepted: true,
      marketingEmailOptIn: false,
    });

    expect(parseMemberEntry("register", form({
      displayName: "Rider One",
      email: "rider@example.com",
      password: "Secret123",
      confirmPassword: "Secret123",
      photoSocialMediaConsent: "on",
    }))).toEqual({ success: false, error: "privacy_policy" });

    expect(parseMemberEntry("register", form({
      displayName: "Rider One",
      email: "rider@example.com",
      password: "Secret123",
      confirmPassword: "Secret123",
      privacyPolicyAccepted: "on",
    }))).toMatchObject({ photoSocialMediaConsent: true, privacyPolicyAccepted: true, marketingEmailOptIn: false });
  });

  it("rejects registration passwords that do not meet every strength requirement", () => {
    const result = parseMemberEntry(
      "register",
      form({
        displayName: "Rider One",
        email: "rider@example.com",
        password: "short",
        confirmPassword: "short",
      }),
    );

    expect(result).toEqual({ success: false, error: "password" });
  });

  it("rejects registration passwords that do not match confirmation", () => {
    const result = parseMemberEntry(
      "register",
      form({
        displayName: "Rider One",
        email: "rider@example.com",
        password: "Secret123",
        confirmPassword: "Secret456",
      }),
    );

    expect(result).toEqual({ success: false, error: "confirm" });
  });

  it("keeps login password validation unchanged", () => {
    const result = parseMemberEntry(
      "login",
      form({ email: "rider@example.com", password: "short" }),
    );

    expect(result).toMatchObject({ success: true, password: "short" });
  });
});

describe("parseMemberMagicLink", () => {
  it("S1-auth-entry-parses-magic-link-email", () => {
    expect(parseMemberMagicLink(form({ email: " Magic@Example.COM " }))).toEqual({
      success: true,
      email: "magic@example.com",
    });
  });
});

describe("parseMemberEmail", () => {
  it("returns normalized email", () => {
    expect(parseMemberEmail(form({ email: " Snow@Example.com " }))).toEqual({
      success: true,
      email: "snow@example.com",
    });
  });

  it("rejects invalid email", () => {
    expect(parseMemberEmail(form({ email: "snow" }))).toEqual({
      success: false,
      error: "email",
    });
  });
});

describe("parseMemberPasswordUpdate", () => {
  it("accepts matching valid passwords", () => {
    expect(
      parseMemberPasswordUpdate(
        form({ password: "Secret123", confirmPassword: "Secret123" }),
      ),
    ).toEqual({ success: true, password: "Secret123" });
  });

  it("rejects short passwords", () => {
    expect(
      parseMemberPasswordUpdate(form({ password: "short", confirmPassword: "short" })),
    ).toEqual({ success: false, error: "password" });
  });

  it("rejects mismatched passwords", () => {
    expect(
      parseMemberPasswordUpdate(
        form({ password: "Secret123", confirmPassword: "Secret456" }),
      ),
    ).toEqual({ success: false, error: "confirm" });
  });
});

describe("member validation", () => {
  it("requires all four password rules", () => {
    expect(validatePassword("Secret123")).toEqual({
      minLength: true,
      hasUppercase: true,
      hasLowercase: true,
      hasNumber: true,
      valid: true,
    });
    expect(validatePassword("secret123")).toMatchObject({ hasUppercase: false, valid: false });
    expect(validatePassword("Secretab")).toMatchObject({ hasNumber: false, valid: false });
  });

  it("accepts normalized email but rejects whitespace and invalid suffixes", () => {
    expect(isValidMemberEmail(" Rider@Example.COM ")).toBe(true);
    expect(isValidMemberEmail("rider @example.com")).toBe(false);
    expect(isValidMemberEmail("rider@example.c")).toBe(false);
    expect(isValidMemberEmail("@example.com")).toBe(false);
  });
});

describe("parseMemberProfileUpdate", () => {
  it("S3-profile-form-normalizes-structured-fields", () => {
    expect(
      parseMemberProfileUpdate(
        form({
          displayName: " Rider One ",
          phone: " 555-0100 ",
          riderType: "snowboarder",
          riderLevel: "advanced",
          homeMountain: " Mammoth ",
          bio: " Powder days ",
          carpoolInterest: "on",
          lodgingInterest: "",
          preferredLanguage: "en",
          instagram: " @snow.force ",
          discord: " rider#1234 ",
          avatarUrl: " https://example.com/avatar.jpg ",
          passes: " ikon, epic , ",
          ownsSnowboard: "on",
          ownsBoots: "on",
          needsRentalHelp: "",
          emergencyContact: " Patrol ",
          emergencyPhone: " 555-9999 ",
        }),
      ),
    ).toEqual({
      success: true,
      data: {
        displayName: "Rider One",
        phone: "555-0100",
        riderType: "snowboarder",
        structuredRiderLevel: "advanced",
        homeMountain: "Mammoth",
        bio: "Powder days",
        carpoolInterest: true,
        lodgingInterest: false,
        preferredLanguage: "en",
        instagram: "snow.force",
        discord: "rider#1234",
        avatarUrl: "https://example.com/avatar.jpg",
        passes: ["ikon", "epic"],
        equipment: {
          ownsSkis: false,
          ownsSnowboard: true,
          ownsBoots: true,
          needsRentalHelp: false,
        },
        emergencyContact: "Patrol",
        emergencyPhone: "555-9999",
      },
    });
  });

  it("rejects invalid structured rider values", () => {
    expect(
      parseMemberProfileUpdate(
        form({
          displayName: "Rider One",
          riderType: "pilot",
          riderLevel: "advanced",
          preferredLanguage: "zh",
        }),
      ),
    ).toEqual({ success: false, error: "riderType" });
  });
});
