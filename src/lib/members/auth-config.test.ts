import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSupabaseConfig() {
  return readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");
}

describe("Supabase local auth email config", () => {
  it("S1-enables-email-confirmation-so-signup-generates-verification-email", () => {
    const config = readSupabaseConfig();

    expect(config).toContain("enable_confirmations = true");
  });

  it("S1-allows-member-auth-callbacks-for-localhost-and-127-dev-origins", () => {
    const config = readSupabaseConfig();

    expect(config).toContain('site_url = "http://localhost:3000"');
    expect(config).toContain("http://localhost:3000/auth/callback");
    expect(config).toContain("http://127.0.0.1:3000/auth/callback");
  });
});
