// Runs actual Medusa payment migrations and capture calls against a disposable
// loopback PostgreSQL database. It never loads project environment credentials.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const { Client } = require("pg");
const { MedusaApp, MedusaModule } = require("@medusajs/framework/modules-sdk");
const { Modules, ModulesSdkUtils } = require("@medusajs/framework/utils");
const { SystemPaymentProvider } = require("@medusajs/payment/dist/providers/system.js");
const { assertFullCaptureGuard } = require("../src/lib/full-capture.ts");
const database = `sf_capture_validation_${randomUUID().replaceAll("-", "")}`;
assert.match(database, /^sf_capture_validation_[a-f0-9]{32}$/);
const connection = { host: "127.0.0.1", port: 15432, user: "capture_test", database, connectionTimeoutMillis: 5000 };
const admin = new Client({ ...connection, database: "postgres" });
let app, db, knex, created = false, providerCalls = 0, failCapture = false;
const checks = [];
class FixtureStripe extends SystemPaymentProvider {
  static identifier = "stripe";
  async capturePayment() {
    providerCalls++;
    if (failCapture) throw new Error("Fixture provider declined capture");
    return { data: {} };
  }
}
try {
  await admin.connect();
  await admin.query(`create database "${database}"`); created = true;
  db = new Client(connection); await db.connect();
  await db.query("create schema commerce");
  for (const role of ["snowforce_commerce", "anon", "authenticated", "service_role"])
    await db.query(`do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role}; end if; end $$`);
  knex = ModulesSdkUtils.createPgConnection({ clientUrl: `postgres://capture_test@127.0.0.1:15432/${database}`, schema: "commerce", pool: { min: 0, max: 4 } });
  const options = () => ({ cwd: process.cwd(), sharedResourcesConfig: { database: { connection: knex, clientUrl: `postgres://capture_test@127.0.0.1:15432/${database}`, schema: "commerce" } },
    modulesConfig: { [Modules.PAYMENT]: { resolve: "@medusajs/payment", options: { providers: [{ resolve: { services: [FixtureStripe] }, id: "stripe" }] } } } });
  const migrationApp = await MedusaApp({ ...options(), migrationOnly: true });
  await migrationApp.runMigrations(); await migrationApp.onApplicationShutdown(); MedusaModule.clearInstances();
  // Native module shutdown closes its injected database pool.
  knex = ModulesSdkUtils.createPgConnection({ clientUrl: `postgres://capture_test@127.0.0.1:15432/${database}`, schema: "commerce", pool: { min: 0, max: 4 } });
  app = await MedusaApp(options());
  const paymentModule = app.modules[Modules.PAYMENT];
  const folder = new URL("../../../supabase/migrations/", import.meta.url);
  const file = readdirSync(folder).find(name => /^\d{14}_shop_single_full_capture\.sql$/.test(name));
  assert.ok(file);
  await db.query(readFileSync(new URL(file, folder), "utf8"));
  const scope = { resolve: () => ({ raw: async sql => db.query(sql) }) };
  await assertFullCaptureGuard(scope); checks.push("actual reviewed invoker trigger passes startup validation");
  const createPayment = async (provider_id = "pp_stripe_stripe") => {
    const collection = await paymentModule.createPaymentCollections({ amount: 109.95, currency_code: "usd" });
    const session = await paymentModule.createPaymentSession(collection.id, { provider_id, amount: 109.95, currency_code: "usd", data: {} });
    return paymentModule.authorizePaymentSession(session.id, {});
  };
  const rows = async id => (await db.query("select amount::text,raw_amount from commerce.capture where payment_id=$1 and deleted_at is null", [id])).rows;
  const payment = await createPayment();
  for (const amount of [100, 0, 109.951]) {
    await assert.rejects(() => paymentModule.capturePayment({ payment_id: payment.id, amount }));
    assert.equal(providerCalls, 0); assert.deepEqual(await rows(payment.id), []);
  }
  checks.push("native partial, zero and sub-cent captures reject before provider calls and roll back records");
  await paymentModule.capturePayment({ payment_id: payment.id, amount: 109.95 });
  assert.equal(providerCalls, 1); assert.equal((await rows(payment.id)).length, 1);
  assert.equal(Number((await rows(payment.id))[0].amount), 109.95);
  await paymentModule.capturePayment({ payment_id: payment.id });
  assert.equal(providerCalls, 1); assert.equal((await rows(payment.id)).length, 1);
  checks.push("native full capture and completed retry produce one provider call and one full record");
  const concurrent = await createPayment(), before = providerCalls;
  const outcomes = await Promise.allSettled([paymentModule.capturePayment({ payment_id: concurrent.id }), paymentModule.capturePayment({ payment_id: concurrent.id })]);
  assert.ok(outcomes.some(value => value.status === "fulfilled"));
  assert.equal(providerCalls - before, 1); assert.equal((await rows(concurrent.id)).length, 1);
  checks.push("concurrent native requests produce one provider call and one full record");
  const failed = await createPayment(); failCapture = true;
  await assert.rejects(() => paymentModule.capturePayment({ payment_id: failed.id }), /Fixture provider declined/);
  assert.deepEqual(await rows(failed.id), []); failCapture = false;
  await paymentModule.capturePayment({ payment_id: failed.id }); assert.equal((await rows(failed.id)).length, 1);
  checks.push("native provider failure removes provisional record and permits a full retry");
  const other = await createPayment("pp_system_default");
  await paymentModule.capturePayment({ payment_id: other.id, amount: 10 });
  assert.equal(Number((await rows(other.id))[0].amount), 10);
  checks.push("unrelated native payment providers retain partial capture behavior");
  const assertSqlRejects = async (sql, values) => {
    await db.query("begin");
    try { await assert.rejects(() => db.query(sql, values), error => error.code === "23514"); }
    finally { await db.query("rollback"); }
  };
  await assertSqlRejects("update commerce.capture set amount=100 where payment_id=$1", [payment.id]);
  await assertSqlRejects("update commerce.capture set raw_amount='{\"value\":\"100\",\"precision\":20}' where payment_id=$1", [payment.id]);
  await assertSqlRejects("update commerce.capture set payment_id=$2 where payment_id=$1", [payment.id, failed.id]);
  await assertSqlRejects("insert into commerce.capture(id,payment_id,amount,raw_amount) values('cap_duplicate',$1,109.95,'{\"value\":\"109.95\",\"precision\":20}')", [payment.id]);
  checks.push("direct writes cannot change amounts, reassign captures or add a second active capture");
  await db.query("begin");
  try { await db.query("alter table commerce.capture disable trigger guard_single_full_stripe_capture"); await assert.rejects(() => assertFullCaptureGuard(scope), /reviewed SnowForce/); }
  finally { await db.query("rollback"); }
  checks.push("disabled database protection fails sales startup validation");
  const privileges = (await db.query("select has_function_privilege('anon','commerce.guard_single_full_stripe_capture()','execute') as anon,has_function_privilege('authenticated','commerce.guard_single_full_stripe_capture()','execute') as authenticated,has_function_privilege('service_role','commerce.guard_single_full_stripe_capture()','execute') as service_role")).rows[0];
  assert.deepEqual(privileges, { anon: false, authenticated: false, service_role: false });
  checks.push("private trigger function is unavailable to public application roles");
  const report = { checkedAt: new Date().toISOString(), status: "passed", postgres: (await db.query("show server_version")).rows[0].server_version, medusa: require("@medusajs/payment/package.json").version, scope: "disposable loopback database; actual native payment module; fixture provider; no live Stripe or production mutations", checks };
  writeFileSync(new URL("../../../output/shop-full-capture-local-verification.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (app) await app.onApplicationShutdown();
  if (knex) await knex.destroy();
  if (db) await db.end();
  if (created) await admin.query(`drop database "${database}" with (force)`);
  await admin.end();
}
