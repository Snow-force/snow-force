import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { productionStartOptions } from "../scripts/start-production.mjs";

function env() {
  return {
    NODE_ENV: "production", DATABASE_URL: "postgresql://commerce:fixture-password@db.bhmwxkynhyhquspiyact.supabase.co:5432/postgres",
    DATABASE_SCHEMA: "commerce", DATABASE_CA_CERT: "fixture-ca", SUPABASE_URL: "https://bhmwxkynhyhquspiyact.supabase.co", SUPABASE_PUBLISHABLE_KEY: "fixture-public-key",
    JWT_SECRET: "a".repeat(48), COOKIE_SECRET: "b".repeat(48), COMMERCE_ORDER_SYNC_SECRET: "c".repeat(48),
    STORE_CORS: "https://snow-force.com", ADMIN_CORS: "https://commerce.snow-force.com", AUTH_CORS: "https://snow-force.com,https://commerce.snow-force.com", SNOWFORCE_STOREFRONT_URL: "https://snow-force.com",
    COMMERCE_OPERATING_MODE: "management", COMMERCE_TAX_POLICY_CONFIRMED: "false", REDIS_URL: "rediss://fixture.redis.invalid:6379",
    S3_ACCESS_KEY_ID: "fixture-access", S3_SECRET_ACCESS_KEY: "fixture-secret", S3_BUCKET: "shop-products", S3_REGION: "us-east-2",
    S3_ENDPOINT: "https://bhmwxkynhyhquspiyact.storage.supabase.co/storage/v1/s3", S3_FILE_URL: "https://bhmwxkynhyhquspiyact.supabase.co/storage/v1/object/public/shop-products",
  };
}

test("production startup binds to the platform's port and public interface without migration commands", () => {
  const result = productionStartOptions({ ...env(), PORT: "8080" });
  assert.deepEqual(result, { errors: [], args: ["start", "--host", "0.0.0.0", "--port", "8080"] });
  assert.equal(productionStartOptions(env()).args.at(-1), "9000");
});

test("startup cannot silently use development rules or an invalid platform port", () => {
  assert.ok(productionStartOptions({ ...env(), NODE_ENV: "development", REDIS_URL: "redis://fixture.invalid" }).errors.length);
  for (const PORT of ["", "0", "-1", "65536", "9000; echo invalid", "1.5", 8080]) {
    assert.ok(productionStartOptions({ ...env(), PORT }).errors.some(error => error.startsWith("PORT")));
  }
});

test("an invalid deployment exits before starting Medusa and redacts credentials", () => {
  const password = "fixture-password-must-never-be-printed";
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/start-production.mjs", import.meta.url))], {
    encoding: "utf8", timeout: 10000, env: { NODE_ENV: "production", DATABASE_URL: `postgresql://postgres:${password}@untrusted.invalid/postgres` },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no database changes were attempted/);
  assert.equal((result.stdout + result.stderr).includes(password), false);
  assert.equal(result.stdout.includes("Server is ready"), false);
});
