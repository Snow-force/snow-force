import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260823071209_allow_configurable_coupon_redemptions.sql",
);

describe("configurable coupon redemption migration contract", () => {
  it("replaces the single-use guards with an atomic configured-limit trigger", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("drop constraint if exists event_coupon_codes_single_use_check");
    expect(sql).toContain("event_coupon_codes_max_redemptions_upper_check");
    expect(sql).toContain("check (max_redemptions <= 100000)");
    expect(sql).toContain("drop index if exists public.registrations_coupon_code_used_once");
    expect(sql).toContain("create index idx_registrations_coupon_code");
    expect(sql).toContain("where coupon_code is not null");
    expect(sql).toContain("for update");
    expect(sql).toContain("registration.status <> 'cancelled'");
    expect(sql).toContain("redemption_count >= coupon_limit");
    expect(sql).toContain("constraint = 'registrations_coupon_redemption_limit'");
    expect(sql).toContain("revoke all on function private.enforce_coupon_redemption_limit() from public");
    expect(sql).toContain("create trigger registrations_enforce_coupon_redemption_limit");
    expect(sql).not.toContain("security definer");
  });
});
