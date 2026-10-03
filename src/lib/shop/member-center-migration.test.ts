import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const directory = path.join(process.cwd(), "supabase/migrations");
const file = readdirSync(directory).find((name) => name.endsWith("_shop_member_center.sql"));
if (!file) throw new Error("Missing reviewed member center migration");
const sql = readFileSync(path.join(directory, file), "utf8").toLowerCase();
describe("member commerce migration permissions", () => {
  it("adds only the two classified commerce read/address tables", () => {
    expect(Array.from(sql.matchAll(/create table ([a-z_.]+)/g), (match) => match[1])).toEqual(["public.shop_member_orders", "public.shop_shipping_addresses"]);
    expect(Array.from(sql.matchAll(/alter table ([a-z_.]+)/g), (match) => match[1])).toEqual(["public.shop_member_orders", "public.shop_shipping_addresses"]);
    expect(sql).not.toMatch(/drop table|alter table public.events|alter table auth.users/);
  });
  it("makes USD order snapshots read-only to authenticated owners", () => {
    expect(sql).toContain("check (currency = 'usd')");
    expect(sql).toContain("grant select on public.shop_member_orders to authenticated");
    expect(sql).not.toMatch(/grant[^;]*(insert|update|delete)[^;]*shop_member_orders to authenticated/);
    expect(sql).toContain("using ((select auth.uid()) = user_id)");
    expect(sql).toContain("with check ((select auth.uid()) = user_id)");
    expect(sql).toContain("revoke all on public.shop_member_orders from anon, authenticated");
  });
  it("keeps address RPCs invoker-only, authenticated and atomic", () => {
    expect(sql).not.toContain("security definer");
    expect(sql.match(/security invoker set search_path = ''/g)).toHaveLength(2);
    expect(sql.match(/owner_id uuid := auth.uid\(\)/g)).toHaveLength(2);
    expect(sql.match(/pg_advisory_xact_lock/g)).toHaveLength(2);
    expect(sql).toContain("create unique index shop_shipping_addresses_one_default");
    expect(sql.match(/from public, anon;/g)).toHaveLength(2);
    expect(sql).toContain("if not found then return false");
  });
});
