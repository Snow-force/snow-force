import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("merchant profile ownership migration", () => {
  it("allows authenticated owners to create and update only their own profile rows", () => {
    // Given: the additive migration that corrects the initial read-only grant.
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260723223333_merchant_profile_owner_writes_and_booth_program_save.sql",
      ),
      "utf8",
    );

    // When: an authenticated merchant writes through the SSR client.
    // Then: privileges and both RLS clauses enforce auth.uid() ownership.
    expect(migration).toContain("grant insert, update on public.merchant_profiles to authenticated;");
    expect(migration).toContain('for insert to authenticated');
    expect(migration).toContain('for update to authenticated');
    expect(migration).toContain("with check (user_id = (select auth.uid()))");
    expect(migration).toContain("using (user_id = (select auth.uid()))");
  });
});
