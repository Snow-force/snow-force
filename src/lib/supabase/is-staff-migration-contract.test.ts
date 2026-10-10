import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260730070511_move_is_staff_to_private_schema.sql",
  ),
  "utf8",
).toLowerCase();

describe("private is_staff migration contract", () => {
  it("keeps the security-definer helper outside the exposed public schema", () => {
    expect(migration).toContain("create or replace function private.is_staff()");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("from public.staff_roles");
    expect(migration).toContain("where user_id = (select auth.uid())");
    expect(migration).not.toContain(
      "create or replace function public.is_staff()",
    );
  });

  it("uses explicit least-privilege function grants", () => {
    expect(migration).toContain(
      "revoke all on function private.is_staff() from public",
    );
    expect(migration).toContain(
      "grant execute on function private.is_staff() to anon, authenticated",
    );
    expect(migration).not.toContain(
      "grant usage on schema private to anon, authenticated",
    );
  });

  it("updates every known RLS dependency before dropping the public helper", () => {
    expect(migration).toContain("updated_policy_count <> 38");
    expect(migration).toContain(
      "'public.is_staff()', 'private.is_staff()'",
    );
    expect(migration).toContain("'is_staff()', 'private.is_staff()'");
    expect(migration).toContain(
      "position('public.is_staff()' in using_expression) > 0",
    );
    expect(migration).toContain("drop function public.is_staff()");

    const createPrivate = migration.indexOf(
      "create or replace function private.is_staff()",
    );
    const updatePolicies = migration.indexOf("updated_policy_count integer");
    const dropPublic = migration.indexOf("drop function public.is_staff()");

    expect(createPrivate).toBeGreaterThanOrEqual(0);
    expect(updatePolicies).toBeGreaterThan(createPrivate);
    expect(dropPublic).toBeGreaterThan(updatePolicies);
  });
});
