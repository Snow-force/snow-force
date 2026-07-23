import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MerchantAuthBoundaryError,
  assertMerchantAuthBoundary,
  createMerchantAuthAccount,
  hasUnsafeMerchantAuthMetadata,
  isMerchantAuthAccount,
  merchantAuthzMetadataKeys,
  toMerchantAuthUserFields,
} from "./auth-boundary";

function readMerchantActionsSource() {
  return readFileSync(
    resolve(process.cwd(), "src/lib/merchants/actions.ts"),
    "utf8",
  );
}

function stripComments(source: string): string {
  // Remove block comments and line comments so docstrings that mention
  // forbidden strings (e.g. `raw_user_meta_data`) do not trip the source
  // code audit tests.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function fakeUser(overrides: {
  id?: string;
  email?: string | null;
  email_confirmed_at?: string | null;
} = {}) {
  return {
    id: overrides.id ?? "merchant-user-1",
    email: overrides.email ?? "booth@example.com",
    email_confirmed_at:
      "email_confirmed_at" in overrides
        ? overrides.email_confirmed_at ?? null
        : "2026-07-22T10:00:00.000Z",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-07-22T10:00:00.000Z",
  };
}

function fakeProfile() {
  return {
    id: "merchant-profile-1",
    userId: "merchant-user-1",
    businessName: "Summit Goods",
    contactName: "Booth Owner",
    contactEmail: "booth@example.com",
    contactPhone: "555-0100",
    category: "Equipment",
    description: "Wax and accessories",
    createdAt: "2026-07-22T10:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z",
  };
}

describe("merchant auth boundary", () => {
  it("S2-merchant-account-carries-confirmed-email-only-from-server-state", () => {
    const account = createMerchantAuthAccount({
      user: fakeUser({ email_confirmed_at: "2026-07-22T10:00:00.000Z" }),
      profile: fakeProfile(),
    });

    expect(account.emailConfirmed).toBe(true);
    expect(account.user.emailConfirmedAt).toBe("2026-07-22T10:00:00.000Z");
    expect(account.user.id).toBe("merchant-user-1");
  });

  it("S2-merchant-account-flags-unverified-email-as-false", () => {
    const account = createMerchantAuthAccount({
      user: fakeUser({ email_confirmed_at: null }),
      profile: fakeProfile(),
    });

    expect(account.emailConfirmed).toBe(false);
  });

  it("S2-merchant-account-allows-null-profile-but-still-brands-the-account", () => {
    const account = createMerchantAuthAccount({
      user: fakeUser(),
      profile: null,
    });

    expect(account.profile).toBeNull();
    expect(isMerchantAuthAccount(account)).toBe(true);
  });

  it("S2-assertion-rejects-unbranded-objects-that-mimic-the-shape", () => {
    const fake = {
      user: {
        id: "merchant-user-1",
        email: "booth@example.com",
        emailConfirmedAt: "2026-07-22T10:00:00.000Z",
      },
      profile: fakeProfile(),
      emailConfirmed: true,
    };

    expect(isMerchantAuthAccount(fake)).toBe(false);
    expect(() => assertMerchantAuthBoundary(fake)).toThrowError(MerchantAuthBoundaryError);
  });

  it("S2-assertion-rejects-non-objects-and-partials", () => {
    expect(() => assertMerchantAuthBoundary(null)).toThrow();
    expect(() => assertMerchantAuthBoundary(undefined)).toThrow();
    expect(() => assertMerchantAuthBoundary("merchant")).toThrow();
    expect(() => assertMerchantAuthBoundary({})).toThrow();
    expect(() =>
      assertMerchantAuthBoundary({
        user: { id: 1, emailConfirmedAt: "x" },
        profile: null,
        emailConfirmed: true,
      }),
    ).toThrow();
  });

  it("S2-auth-fields-strip-everything-beyond-the-required-minimum", () => {
    const full = {
      ...fakeUser(),
      user_metadata: { is_merchant: "true" },
      app_metadata: { is_admin: true },
    };
    const fields = toMerchantAuthUserFields(
      full as unknown as Parameters<typeof toMerchantAuthUserFields>[0],
    );

    expect(fields).toEqual({
      id: "merchant-user-1",
      email: "booth@example.com",
      emailConfirmedAt: "2026-07-22T10:00:00.000Z",
    });
  });

  it("S2-unsafe-metadata-flags-any-self-claim-roles", () => {
    expect(hasUnsafeMerchantAuthMetadata({ is_merchant: true })).toBe(true);
    expect(hasUnsafeMerchantAuthMetadata({ role: "merchant" })).toBe(true);
    expect(hasUnsafeMerchantAuthMetadata({ vendor: true })).toBe(true);
    expect(hasUnsafeMerchantAuthMetadata({ booth_owner: true })).toBe(true);
    expect(hasUnsafeMerchantAuthMetadata({})).toBe(false);
    expect(hasUnsafeMerchantAuthMetadata({ display_name: "Booth Owner" })).toBe(false);
  });

  it("S2-merchant-authz-disallowed-key-list-includes-every-known-claim", () => {
    expect(merchantAuthzMetadataKeys).toEqual(
      expect.arrayContaining([
        "is_merchant",
        "merchant",
        "role",
        "roles",
        "vendor",
        "booth_owner",
      ]),
    );
  });

  it("S2-actions-source-never-uses-raw_user_meta_data-for-authorization", () => {
    // Strip comments so docstrings that legitimately explain the rule do
    // not trip the assertion.
    const code = stripComments(readMerchantActionsSource());
    const forbidden = [
      /raw_user_meta_data/,
      /user_metadata\?\.\w+\s*===\s*['"]merchant['"]/,
      /user_metadata\.\w+\s*===\s*['"]merchant['"]/,
    ];
    for (const pattern of forbidden) {
      expect(code).not.toMatch(pattern);
    }
  });

  it("S2-actions-source-never-writes-to-the-rider-member_profiles-table", () => {
    const code = stripComments(readMerchantActionsSource());
    expect(code).not.toMatch(/member_profiles/);
  });
});
