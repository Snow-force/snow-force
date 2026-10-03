import { test } from "node:test";
import assert from "node:assert/strict";
import { configurationErrors } from "../scripts/preflight.mjs";

const env = () => ({
  DATABASE_URL: "postgresql://commerce_user:fixture-password@db.bhmwxkynhyhquspiyact.supabase.co:5432/postgres",
  DATABASE_SCHEMA: "commerce", SUPABASE_URL: "https://bhmwxkynhyhquspiyact.supabase.co", SUPABASE_PUBLISHABLE_KEY: "fixture-publishable-key",
  JWT_SECRET: "a".repeat(48), COOKIE_SECRET: "b".repeat(48), STORE_CORS: "http://127.0.0.1:3100", ADMIN_CORS: "http://127.0.0.1:9000", AUTH_CORS: "http://127.0.0.1:3100",
  S3_ACCESS_KEY_ID: "fixture-access", S3_SECRET_ACCESS_KEY: "fixture-secret", S3_BUCKET: "shop-products", S3_REGION: "us-east-2",
  S3_ENDPOINT: "https://bhmwxkynhyhquspiyact.storage.supabase.co/storage/v1/s3", S3_FILE_URL: "https://bhmwxkynhyhquspiyact.supabase.co/storage/v1/object/public/shop-products",
});
test("accepts the existing database with a dedicated commerce role", () => assert.deepEqual(configurationErrors(env()), []));
test("rejects a second database, public schema, privileged roles, and transaction poolers", () => {
  for (const url of ["postgresql://commerce:pw@db.other.supabase.co/postgres", "postgresql://postgres:pw@db.bhmwxkynhyhquspiyact.supabase.co/postgres", "postgresql://commerce.bhmwxkynhyhquspiyact:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres", "postgresql://commerce:pw@db.bhmwxkynhyhquspiyact.supabase.co/another_database"]) assert.ok(configurationErrors({ ...env(), DATABASE_URL: url }).length);
  assert.ok(configurationErrors({ ...env(), DATABASE_SCHEMA: "public" }).length);
});
test("accepts the existing Supabase session pooler", () => assert.deepEqual(configurationErrors({ ...env(), DATABASE_URL: "postgresql://commerce.bhmwxkynhyhquspiyact:pw@aws-0-us-east-2.pooler.supabase.com:5432/postgres" }), []));
test("requires durable TLS infrastructure and HTTPS origins in production", () => {
  assert.ok(configurationErrors({ ...env(), NODE_ENV: "production" }).length >= 5);
  assert.deepEqual(configurationErrors({ ...env(), NODE_ENV: "production", REDIS_URL: "rediss://fixture.redis.invalid:6379", DATABASE_CA_CERT: "fixture-ca", STORE_CORS: "https://snow-force.com", ADMIN_CORS: "https://commerce.snow-force.com", AUTH_CORS: "https://snow-force.com,https://commerce.snow-force.com", COMMERCE_STRIPE_API_KEY: "sk_test_fixture", COMMERCE_STRIPE_WEBHOOK_SECRET: "whsec_fixture", COMMERCE_TAX_POLICY_CONFIRMED: "true", COMMERCE_ORDER_SYNC_SECRET: "c".repeat(48), SNOWFORCE_STOREFRONT_URL: "https://snow-force.com" }), []);
});
test("never exposes credentials in validation messages", () => {
  const credential = "fixture-secret-password";
  assert.ok(!configurationErrors({ ...env(), DATABASE_URL: `postgresql://postgres:${credential}@unknown.invalid/db` }).join("\n").includes(credential));
});
test("rejects wildcard origins, shared secrets, unconfigured payment webhooks", () => {
  assert.ok(configurationErrors({ ...env(), AUTH_CORS: "*", COOKIE_SECRET: env().JWT_SECRET, COMMERCE_STRIPE_API_KEY: "sk_test_fixture" }).length >= 3);
});

test("requires durable product storage in production and rejects foreign upload destinations", () => {
  assert.ok(configurationErrors({ ...env(), S3_SECRET_ACCESS_KEY: undefined }).length > 0);
  assert.ok(configurationErrors({ ...env(), S3_ENDPOINT: "https://other.invalid/s3" }).length > 0);
  assert.deepEqual(configurationErrors({ ...env(), S3_ACCESS_KEY_ID: undefined, S3_SECRET_ACCESS_KEY: undefined }), []);
  assert.ok(configurationErrors({ ...env(), NODE_ENV: "production", S3_ACCESS_KEY_ID: undefined, S3_SECRET_ACCESS_KEY: undefined }).some((error) => error.includes("durable product uploads")));
});

test("requires an independent bridge secret and exact trusted storefront origin", () => {
  const bridge = { ...env(), COMMERCE_ORDER_SYNC_SECRET: "c".repeat(48), SNOWFORCE_STOREFRONT_URL: "http://127.0.0.1:3100" };
  assert.deepEqual(configurationErrors(bridge), []);
  for (const change of [{ COMMERCE_ORDER_SYNC_SECRET: "short" }, { COMMERCE_ORDER_SYNC_SECRET: bridge.JWT_SECRET }, { SNOWFORCE_STOREFRONT_URL: "http://external.invalid" }, { SNOWFORCE_STOREFRONT_URL: "https://user:password@store.invalid" }, { SNOWFORCE_STOREFRONT_URL: "https://store.invalid/path" }]) assert.ok(configurationErrors({ ...bridge, ...change }).length);
});
