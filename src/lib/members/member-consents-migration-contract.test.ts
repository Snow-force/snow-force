import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("member consent migration", () => {
  it("S1-creates versioned consent evidence without auto-creating member profiles", async () => {
    const migration = await readFile(
      "supabase/migrations/20260805025959_unify_member_identity_consent_flow.sql",
      "utf8",
    );

    expect(migration).toContain("create table if not exists public.member_consents");
    expect(migration).toContain("user_id uuid not null references auth.users(id) on delete cascade");
    expect(migration).toContain("consent_type text not null");
    expect(migration).toContain("policy_version text not null");
    expect(migration).toContain("accepted boolean not null");
    expect(migration).toContain("accepted_at timestamptz");
    expect(migration).toContain("locale text not null");
    expect(migration).toContain("acceptance_source text not null");
    expect(migration).toContain("unique (user_id, consent_type, policy_version)");
    expect(migration).toContain("alter table public.member_consents enable row level security");
    expect(migration).toContain("using ((select auth.uid()) = user_id)");
    expect(migration).toContain("with check ((select auth.uid()) = user_id)");
    expect(migration).toContain("grant select, insert, update on table public.member_consents to authenticated");
    expect(migration).toContain("drop trigger if exists create_member_profile_after_signup on auth.users");
    expect(migration).not.toContain("create trigger create_member_profile_after_signup");
  });

  it("S2-limits authenticated members to non-destructive consent privileges", async () => {
    const migration = await readFile(
      "supabase/migrations/20260805040054_limit_member_consents_authenticated_grants.sql",
      "utf8",
    );

    expect(migration).toContain(
      "revoke all on table public.member_consents from authenticated",
    );
    expect(migration).toContain(
      "grant select, insert, update on table public.member_consents to authenticated",
    );
    expect(migration).not.toContain(
      "grant all on table public.member_consents to authenticated",
    );
  });
});
