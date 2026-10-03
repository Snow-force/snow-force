import { test } from "node:test";
import assert from "node:assert/strict";
import { commerceConnectionString } from "../scripts/configure-database.mjs";
test("derives a scoped connection on the same database and pooler", () => {
  const url = new URL(commerceConnectionString("postgresql://postgres.bhmwxkynhyhquspiyact:fixture@aws-1-us-east-2.pooler.supabase.com:5432/postgres", "generated-password"));
  assert.equal(url.username, "snowforce_commerce.bhmwxkynhyhquspiyact");
  assert.equal(url.password, "generated-password");
  assert.equal(url.hostname, "aws-1-us-east-2.pooler.supabase.com");
});
test("rejects wrong projects, new databases, placeholders and transaction connections", () => {
  for (const url of ["postgresql://postgres.other:fixture@aws-1-us-east-2.pooler.supabase.com:5432/postgres", "postgresql://postgres:fixture@db.bhmwxkynhyhquspiyact.supabase.co/medusa", "postgresql://postgres:[YOUR-PASSWORD]@db.bhmwxkynhyhquspiyact.supabase.co/postgres", "postgresql://postgres.bhmwxkynhyhquspiyact:fixture@aws-1-us-east-2.pooler.supabase.com:6543/postgres"]) assert.throws(() => commerceConnectionString(url, "generated"));
});
