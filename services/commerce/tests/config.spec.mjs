import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const backend = fileURLToPath(new URL("../", import.meta.url));
const fixtureJwt = "fixture-jwt-" + "a".repeat(40);
const fixtureCookie = "fixture-cookie-" + "b".repeat(40);

async function configResult(overrides = {}) {
  const directory = await mkdtemp(resolve(tmpdir(), "snowforce-commerce-config-"));
  try {
    await writeFile(resolve(directory, ".env.development"), [
      `JWT_SECRET=${fixtureJwt}`, `COOKIE_SECRET=${fixtureCookie}`,
      "DATABASE_URL=postgresql://fixture:fixture@localhost/postgres",
      "SUPABASE_URL=https://bhmwxkynhyhquspiyact.supabase.co",
      "SUPABASE_PUBLISHABLE_KEY=sb_publishable_fixture",
    ].join("\n"));
    const environment = { ...process.env, NODE_ENV: "development", TS_NODE_PROJECT: resolve(backend, "tsconfig.json") };
    for (const key of ["JWT_SECRET", "COOKIE_SECRET", "DATABASE_URL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "REDIS_URL", "REDIS_CA_CERT", "COMMERCE_STRIPE_API_KEY", "COMMERCE_STRIPE_WEBHOOK_SECRET", "COMMERCE_OPERATING_MODE"]) delete environment[key];
    Object.assign(environment, overrides);
    const script = `
      require(${JSON.stringify(resolve(backend, "node_modules/ts-node/register/transpile-only"))});
      const config = require(${JSON.stringify(resolve(backend, "medusa-config.ts"))});
      process.stdout.write("CONFIG_RESULT=" + JSON.stringify({
        jwtMatches: config.projectConfig.http.jwtSecret === ${JSON.stringify(overrides.JWT_SECRET || fixtureJwt)},
        cookieMatches: config.projectConfig.http.cookieSecret === ${JSON.stringify(fixtureCookie)},
        schema: config.projectConfig.databaseSchema,
        authMethods: config.projectConfig.http.authMethodsPerActor,
        stripeCapture: Object.values(config.modules || {}).find(m => m.resolve === "@medusajs/medusa/payment")?.options?.providers?.[0]?.options.capture,
        fulfillmentProviders: Object.values(config.modules || {}).find(m => m.resolve === "@medusajs/medusa/fulfillment")?.options?.providers?.map(({ resolve, id }) => ({ resolve, id })),
        redisClients: [config.projectConfig.redisOptions, ...Object.values(config.modules || {}).filter(m => /caching|event-bus-redis|workflow-engine-redis|locking$/.test(m.resolve)).flatMap(m => m.options?.providers ? m.options.providers.map(p => p.options.redisOptions) : [m.options?.redis?.redisOptions || m.options?.redisOptions])].map(options => ({family:options?.family, verifies:options?.tls?.rejectUnauthorized, caMatches:options?.tls?.ca === 'fixture-public-ca\\nsecond-line'}))
      }));
    `;
    const result = spawnSync(process.execPath, ["-e", script], { cwd: directory, env: environment, encoding: "utf8", timeout: 30_000 });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!result.stdout.includes(fixtureJwt) && !result.stdout.includes(fixtureCookie));
    return JSON.parse(result.stdout.split("CONFIG_RESULT=")[1]);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test("actual Medusa config loads protected development credentials and preserves the commerce schema", async () => {
  const result = await configResult();
  assert.equal(result.jwtMatches, true);
  assert.equal(result.cookieMatches, true);
  assert.equal(result.schema, "commerce");
  assert.deepEqual(result.authMethods, { customer: ["supabase"], user: ["emailpass"] });
  assert.deepEqual(result.fulfillmentProviders, [{ resolve: "@medusajs/medusa/fulfillment-manual", id: "manual" }, { resolve: "./src/modules/snowforce-fulfillment", id: "snowforce" }]);
});

test("explicit runtime secrets take precedence over the development file", async () => {
  const result = await configResult({ JWT_SECRET: "runtime-secret-" + "c".repeat(40) });
  assert.equal(result.jwtMatches, true);
  assert.equal(result.cookieMatches, true);
});
test("commerce authorizes Stripe payments before operator capture", async () => {
  const result = await configResult({ COMMERCE_STRIPE_API_KEY: "sk_test_fixture", COMMERCE_STRIPE_WEBHOOK_SECRET: "whsec_fixture" });
  assert.equal(result.stripeCapture, false);
});

test("management mode omits the Stripe provider even when old test keys remain in the environment", async () => {
  const result = await configResult({ COMMERCE_OPERATING_MODE: "management", COMMERCE_STRIPE_API_KEY: "sk_test_fixture", COMMERCE_STRIPE_WEBHOOK_SECRET: "whsec_fixture" });
  assert.equal(result.stripeCapture, undefined);
});

test("sessions, cache, events, workflows and locks all verify private Redis TLS with the configured CA", async () => {
  const result = await configResult({ REDIS_URL: "rediss://snowforce-redis.railway.internal:6379", REDIS_CA_CERT: "fixture-public-ca\\nsecond-line" });
  assert.equal(result.redisClients.length, 5);
  for (const client of result.redisClients) assert.deepEqual(client, { family: 0, verifies: true, caMatches: true });
});
