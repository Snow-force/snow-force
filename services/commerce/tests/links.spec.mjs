import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { privateLinkSQL } = createRequire(import.meta.url)("../scripts/sync-private-links.cjs");

const create = () => ({ action: "create", tableName: "cart_payment_collection", sql: `set names 'utf8'; create schema if not exists "commerce";
create table if not exists "commerce"."cart_payment_collection" ("cart_id" varchar(255) not null, "payment_collection_id" varchar(255) not null);
CREATE INDEX IF NOT EXISTS "IDX_cart" ON "commerce"."cart_payment_collection" ("cart_id");
CREATE INDEX IF NOT EXISTS "IDX_active" ON "cart_payment_collection" ("cart_id") WHERE deleted_at IS NULL;` });

test("retains the actual upstream table and index SQL without requesting database CREATE privileges", () => {
  const sql = privateLinkSQL(create());
  assert.ok(sql.includes('create table if not exists "commerce"."cart_payment_collection"'));
  assert.ok(sql.includes('CREATE INDEX IF NOT EXISTS "IDX_cart"'));
  assert.ok(sql.includes('CREATE INDEX IF NOT EXISTS "IDX_active" ON "commerce"."cart_payment_collection"'));
  assert.ok(!/create schema|set names/i.test(sql));
});

test("fails closed on unexpected schemas, destructive statements and changed link plans", () => {
  for (const action of [
    { ...create(), action: "delete" },
    { ...create(), sql: create().sql.replaceAll('"commerce"', '"public"') },
    { ...create(), sql: create().sql + 'drop table "commerce"."order";' },
    { ...create(), sql: create().sql.replace('"payment_collection_id" varchar(255) not null', '"payment_collection_id" varchar(255) references "public"."events"') },
    { ...create(), tableName: "../other" },
    { ...create(), sql: create().sql + 'create index if not exists "IDX_other" on "public"."events" ("id");' },
  ]) assert.throws(() => privateLinkSQL(action));
});
