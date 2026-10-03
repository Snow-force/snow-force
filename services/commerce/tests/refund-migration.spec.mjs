import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
const migrations = new URL("../../../supabase/migrations/", import.meta.url);
const files = readdirSync(migrations).filter((file) => /^\d{14}_shop_refund_finality\.sql$/.test(file));
test("refund evidence stays private, owned by commerce, with RLS and append-only observations", () => {
  assert.equal(files.length, 1);
  const sql = readFileSync(new URL(files[0], migrations), "utf8");
  for (const table of ["snowforce_refund_verifications", "snowforce_refund_verification_history"]) {
    assert.ok(sql.includes(`create table commerce.${table}`));
    assert.ok(sql.includes(`alter table commerce.${table} owner to snowforce_commerce`));
    assert.ok(sql.includes(`alter table commerce.${table} enable row level security`));
  }
  assert.ok(sql.includes("from public,anon,authenticated,service_role"));
  assert.ok(sql.includes("security invoker set search_path=''"));
  assert.ok(sql.includes("before update or delete on commerce.snowforce_refund_verification_history"));
  assert.ok(!/security definer|create policy|create table public\.|grant .* to (anon|authenticated|service_role)/i.test(sql));
});
