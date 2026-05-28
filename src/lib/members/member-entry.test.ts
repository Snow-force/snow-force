import { describe, expect, it } from "vitest";
import {
  parseMemberEmail,
  parseMemberEntry,
  parseMemberMagicLink,
  parseMemberPasswordUpdate,
  parseMemberProfileUpdate,
} from "./member-entry";

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
        form({ password: "secret123", confirmPassword: "secret123" }),
      ),
    ).toEqual({ success: true, password: "secret123" });
  });

  it("rejects short passwords", () => {
    expect(
      parseMemberPasswordUpdate(form({ password: "short", confirmPassword: "short" })),
    ).toEqual({ success: false, error: "password" });
  });

  it("rejects mismatched passwords", () => {
    expect(
      parseMemberPasswordUpdate(
        form({ password: "secret123", confirmPassword: "secret456" }),
      ),
    ).toEqual({ success: false, error: "confirm" });
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
