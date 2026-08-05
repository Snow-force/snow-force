import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Cross-flow regression tests.
 *
 * The merchant auth flow is a separate boundary from the rider/member flow.
 * These tests assert the two modules stay syntactically and behaviourally
 * isolated so a future change cannot silently leak data between them.
 */

function readFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("merchant/member auth boundary isolation", () => {
  it("S2-member-actions-do-not-import-from-merchant-actions", () => {
    const code = stripComments(readFile("src/lib/members/actions.ts"));
    expect(code).not.toMatch(/from\s+['"]@\/lib\/merchants\/actions['"]/);
    expect(code).not.toMatch(/from\s+['"]\.\.\/merchants\/actions['"]/);
  });

  it("S2-merchant-actions-do-not-import-from-member-actions", () => {
    const code = stripComments(readFile("src/lib/merchants/actions.ts"));
    expect(code).not.toMatch(/from\s+['"]@\/lib\/members\/actions['"]/);
    expect(code).not.toMatch(/from\s+['"]\.\.\/members\/actions['"]/);
  });

  it("S2-member-profile-creation-remains-behind-current-privacy-consent", () => {
    const actions = stripComments(readFile("src/lib/members/actions.ts"));
    const consents = stripComments(readFile("src/lib/members/member-consents.ts"));

    expect(actions).not.toMatch(/from\(\s*['"]member_profiles['"]\s*\)\s*\.insert/);
    expect(actions).toMatch(/ensureMemberProfileAfterConsent/);
    expect(consents).toMatch(/hasCurrentPrivacyConsent/);
    expect(consents).toMatch(/from\(\s*['"]member_profiles['"]\s*\)/);
    expect(consents).toMatch(/user_id:\s*user\.id/);
  });

  it("S2-member-auth-sanitizer-remains-unchanged-and-still-allows-only-known-paths", () => {
    const code = stripComments(readFile("src/lib/members/auth-results.ts"));
    expect(code).toMatch(/allowedNextPrefixes/);
    // Member sanitizer keeps the historical allow-list, not merchant paths.
    expect(code).not.toMatch(/"\/merchant"/);
  });

  it("S2-merchant-auth-sanitizer-uses-an-allow-list-of-just-merchant-paths", () => {
    const code = stripComments(readFile("src/lib/merchants/auth-results.ts"));
    expect(code).toMatch(/allowedMerchantNextPrefixes/);
    expect(code).toMatch(/"\/merchant"/);
    expect(code).not.toMatch(/"\/member"/);
    expect(code).not.toMatch(/"\/admin"/);
  });

  it("S2-auth-callback-route-sanitizes-per-surface-not-globally", () => {
    const code = stripComments(readFile("src/app/auth/callback/route.ts"));
    expect(code).toMatch(/sanitizeMerchantNextPath/);
    expect(code).toMatch(/sanitizeMemberNextPath/);
    // It must dispatch by prefix, not blindly trust a single sanitizer.
    expect(code).toMatch(/startsWith\(\s*['"]\/merchant['"]\s*\)/);
  });
});
