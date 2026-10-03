import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const migration = readFileSync("supabase/migrations/20261001063635_shop_order_projection_sync.sql", "utf8").toLowerCase();

describe("atomic member order projection migration", () => {
  it("extends only the read model while retaining member RLS and the restricted commerce role", () => {
    expect(migration).toContain("alter table public.shop_member_orders");
    for (const field of ["credit_cents", "rounding_cents", "native_version", "payment_status", "fulfillment_status", "source_observed_at"]) expect(migration).toContain(`add column ${field}`);
    expect(migration).not.toMatch(/disable row level security|drop policy|grant .* to snowforce_commerce|alter table (auth|commerce)\./);
    expect(migration).toContain("- credit_cents::bigint + rounding_cents::bigint = total_cents::bigint");
  });
  it("allows only a trusted service writer without a public security definer", () => {
    expect(migration).toContain("security invoker set search_path = ''");
    expect(migration).not.toContain("security definer");
    expect(migration).toContain("revoke all on function public.shop_sync_member_order(uuid,jsonb,timestamptz) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.shop_sync_member_order(uuid,jsonb,timestamptz) to service_role");
  });
  it("locks each order, refuses ownership changes and gates concurrent stale notifications", () => {
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(incoming.id, 7301))");
    expect(migration).toContain("existing.user_id is distinct from member_id");
    expect(migration).toContain("incoming.user_id is distinct from member_id");
    expect(migration).toContain("excluded.native_version > stored.native_version");
    expect(migration).toContain("excluded.source_observed_at >= stored.source_observed_at");
    expect(migration.split("on conflict (id) do update set")[1]).not.toContain("user_id=");
    expect(migration).toContain("count(distinct item->>'id')");
    expect(migration).toContain("(item->>'returnedquantity')::integer > (item->>'quantity')::integer");
  });
});
