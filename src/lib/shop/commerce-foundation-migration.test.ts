import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("isolates the new commerce owner without modifying application tables or creating a database", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261001023718_shop_commerce_foundation.sql"), "utf8");
  expect(sql).toMatch(/create role snowforce_commerce nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls/i);
  expect(sql).toMatch(/create schema commerce authorization snowforce_commerce/i);
  expect(sql).toMatch(/revoke all on schema commerce from public, anon, authenticated, service_role/i);
  expect(sql).toMatch(/has_schema_privilege\('snowforce_commerce', 'public', 'CREATE'\)/i);
  expect(sql).not.toMatch(/\b(create|drop) database\b|\balter table\b|\bcreate table\b|\bsecurity definer\b/i);
});
