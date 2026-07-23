import { describe, expect, it } from "vitest";
import {
  parseMerchantEmail,
  parseMerchantEntry,
  parseMerchantMagicLink,
  parseMerchantPasswordUpdate,
  parseMerchantProfileUpdate,
} from "./merchant-entry";

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

describe("parseMerchantEntry", () => {
  it("normalizes valid login email and surfaces the merchant contact name", () => {
    const result = parseMerchantEntry(
      "login",
      form({ email: " Booth@Example.COM ", password: "secret123" }),
    );

    expect(result).toEqual({
      success: true,
      email: "booth@example.com",
      contactName: "",
      businessName: "",
      category: "",
      password: "secret123",
      remember: false,
    });
  });

  it("requires a business name and contact name for registration", () => {
    expect(
      parseMerchantEntry(
        "register",
        form({ email: "booth@example.com", password: "secret123" }),
      ),
    ).toEqual({ success: false, error: "register_fields" });

    expect(
      parseMerchantEntry(
        "register",
        form({
          email: "booth@example.com",
          password: "secret123",
          contactName: "Booth Owner",
        }),
      ),
    ).toEqual({ success: false, error: "business_name" });
  });

  it("rejects a missing or whitespace-only business category for registration", () => {
    const baseEntry = {
      email: "booth@example.com",
      password: "secret123",
      contactName: "Booth Owner",
      businessName: "Summit Goods",
    };

    expect(parseMerchantEntry("register", form(baseEntry))).toEqual({
      success: false,
      error: "category",
    });
    expect(
      parseMerchantEntry("register", form({ ...baseEntry, category: "   " })),
    ).toEqual({ success: false, error: "category" });
  });

  it("accepts a complete registration payload", () => {
    const result = parseMerchantEntry(
      "register",
      form({
        email: " Booth@Example.COM ",
        password: "secret123",
        contactName: "Booth Owner",
        businessName: "Summit Goods",
        category: " Equipment ",
      }),
    );

    expect(result).toEqual({
      success: true,
      email: "booth@example.com",
      contactName: "Booth Owner",
      businessName: "Summit Goods",
      category: "Equipment",
      password: "secret123",
      remember: false,
    });
  });

  it("rejects invalid email format", () => {
    expect(
      parseMerchantEntry(
        "login",
        form({ email: "not-an-email", password: "secret123" }),
      ),
    ).toEqual({ success: false, error: "email" });
  });
});

describe("parseMerchantMagicLink", () => {
  it("S1-auth-entry-parses-magic-link-email", () => {
    expect(parseMerchantMagicLink(form({ email: " Magic@Example.COM " }))).toEqual({
      success: true,
      email: "magic@example.com",
    });
  });
});

describe("parseMerchantEmail", () => {
  it("returns normalized email", () => {
    expect(parseMerchantEmail(form({ email: " Snow@Example.com " }))).toEqual({
      success: true,
      email: "snow@example.com",
    });
  });

  it("rejects invalid email", () => {
    expect(parseMerchantEmail(form({ email: "snow" }))).toEqual({
      success: false,
      error: "email",
    });
  });
});

describe("parseMerchantPasswordUpdate", () => {
  it("accepts matching valid passwords", () => {
    expect(
      parseMerchantPasswordUpdate(
        form({ password: "secret123", confirmPassword: "secret123" }),
      ),
    ).toEqual({ success: true, password: "secret123" });
  });

  it("rejects short passwords", () => {
    expect(
      parseMerchantPasswordUpdate(form({ password: "short", confirmPassword: "short" })),
    ).toEqual({ success: false, error: "password" });
  });

  it("rejects mismatched passwords", () => {
    expect(
      parseMerchantPasswordUpdate(
        form({ password: "secret123", confirmPassword: "secret456" }),
      ),
    ).toEqual({ success: false, error: "confirm" });
  });
});

describe("parseMerchantProfileUpdate", () => {
  it("S3-profile-form-normalizes-business-and-contact-fields", () => {
    expect(
      parseMerchantProfileUpdate(
        form({
          businessName: " Summit Goods ",
          contactName: " Booth Owner ",
          contactEmail: " BOOTH@example.com ",
          contactPhone: " 555-0100 ",
          category: " Equipment ",
          description: " Wax and accessories ",
          preferredLanguage: "en",
        }),
      ),
    ).toEqual({
      success: true,
      data: {
        businessName: "Summit Goods",
        contactName: "Booth Owner",
        contactEmail: "booth@example.com",
        contactPhone: "555-0100",
        category: "Equipment",
        description: "Wax and accessories",
        preferredLanguage: "en",
      },
    });
  });

  it("defaults preferred language to zh when not provided", () => {
    expect(
      parseMerchantProfileUpdate(
        form({
          businessName: "Summit Goods",
          contactName: "Booth Owner",
          contactEmail: "booth@example.com",
          category: "Equipment",
        }),
      ),
    ).toMatchObject({
      success: true,
      data: { preferredLanguage: "zh" },
    });
  });

  it("rejects empty business or contact name", () => {
    expect(
      parseMerchantProfileUpdate(
        form({ businessName: "", contactName: "Booth Owner", contactEmail: "booth@example.com" }),
      ),
    ).toEqual({ success: false, error: "businessName" });
    expect(
      parseMerchantProfileUpdate(
        form({ businessName: "Summit Goods", contactName: "", contactEmail: "booth@example.com" }),
      ),
    ).toEqual({ success: false, error: "contactName" });
  });

  it("rejects a missing or whitespace-only business category", () => {
    const baseEntry = {
      businessName: "Summit Goods",
      contactName: "Booth Owner",
      contactEmail: "booth@example.com",
    };

    expect(parseMerchantProfileUpdate(form(baseEntry))).toEqual({
      success: false,
      error: "category",
    });
    expect(
      parseMerchantProfileUpdate(form({ ...baseEntry, category: "   " })),
    ).toEqual({ success: false, error: "category" });
  });

  it("rejects invalid contact email", () => {
    expect(
      parseMerchantProfileUpdate(
        form({ businessName: "Summit Goods", contactName: "Booth Owner", contactEmail: "not-an-email" }),
      ),
    ).toEqual({ success: false, error: "contactEmail" });
  });

  it("rejects unknown preferred language", () => {
    expect(
      parseMerchantProfileUpdate(
        form({
          businessName: "Summit Goods",
          contactName: "Booth Owner",
          contactEmail: "booth@example.com",
          category: "Equipment",
          preferredLanguage: "jp",
        }),
      ),
    ).toEqual({ success: false, error: "preferredLanguage" });
  });
});
