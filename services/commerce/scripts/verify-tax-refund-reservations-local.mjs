// Disposable loopback database, real Medusa order/return/payment/user modules.
// Original committed tax-sale and after-sales rows are fixtures. No Stripe HTTP.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { refundFixture } from "../tests/fixtures/tax-refund.mjs";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const { Client } = require("pg"), { MedusaApp, MedusaModule } = require("@medusajs/framework/modules-sdk");
const { Modules, ModulesSdkUtils } = require("@medusajs/framework/utils");
const { SystemPaymentProvider } = require("@medusajs/payment/dist/providers/system.js");
const { checkedTaxSaleSource, taxSaleFingerprint, taxSaleRequest, assertTaxSaleTransaction } = require("../src/lib/tax-sale-contract.ts");
const { nativeTaxQuotePlan } = require("../src/lib/tax-quote-money.ts");
const { readTaxRefundSource } = require("../src/lib/tax-refund-source.ts");
const { reserveTaxRefund, startTaxRefundReservation, cancelTaxRefundReservation, recheckRefundExecutionApproval } = require("../src/lib/tax-refund-reservations.ts");
class FixtureStripe extends SystemPaymentProvider {
  static identifier = "stripe";
  static refundCalls = 0;
  static refundVerifier = null;
  async refundPayment(input) { FixtureStripe.refundCalls++; return FixtureStripe.refundVerifier ? FixtureStripe.refundVerifier(input) : { data: input.data }; }
}
const database = `sf_refund_reservation_${randomUUID().replaceAll("-", "")}`;
assert.match(database, /^sf_refund_reservation_[a-f0-9]{32}$/);
const connection = { host: "127.0.0.1", port: 15432, user: "capture_test", database, connectionTimeoutMillis: 5000 };
const admin = new Client({ ...connection, database: "postgres" });
let db, knex, app, created = false; const checks = [];
const completionOnly = process.argv.includes("--with-after-sales-completion");
const nativeWorkflow = process.argv.includes("--with-native-refund-workflow");
assert.ok(!(completionOnly && nativeWorkflow), "Run completion and initial workflow verification separately");
try {
  await admin.connect(); await admin.query(`create database "${database}"`); created = true;
  db = new Client(connection); await db.connect(); await db.query("create schema commerce");
  for (const role of ["snowforce_commerce", "anon", "authenticated", "service_role"])
    await db.query(`do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role}; end if; end $$`);
  const newPool = () => ModulesSdkUtils.createPgConnection({ clientUrl: `postgres://capture_test@127.0.0.1:15432/${database}`, schema: "commerce", pool: { min: 0, max: 6 } });
  knex = newPool();
  const modulesConfig = {
    [Modules.ORDER]: { resolve: "@medusajs/order" }, [Modules.USER]: { resolve: "@medusajs/user", options: { jwt_secret: "local-refund-verification-fixture-secret-only" } },
    [Modules.PAYMENT]: { resolve: "@medusajs/payment", options: { providers: [{ resolve: { services: [FixtureStripe] }, id: "stripe" }] } },
    ...(completionOnly ? { [Modules.CUSTOMER]: { resolve: "@medusajs/customer" } } : {}),
    ...(nativeWorkflow ? { [Modules.EVENT_BUS]: { resolve: "@medusajs/event-bus-local" } } : {}),
  };
  const options = (modules = modulesConfig) => ({ cwd: process.cwd(), sharedResourcesConfig: { database: { connection: knex, clientUrl: `postgres://capture_test@127.0.0.1:15432/${database}`, schema: "commerce" } }, modulesConfig: modules });
  // A module migration closes the injected pool. Give each native migration
  // its own pool rather than reusing a destroyed connection in the next module.
  for (const [key, module] of Object.entries(modulesConfig)) {
    const migrationApp = await MedusaApp({ ...options({ [key]: module }), migrationOnly: true });
    await migrationApp.runMigrations(); await migrationApp.onApplicationShutdown(); MedusaModule.clearInstances(); knex = newPool();
  }
  app = await MedusaApp(options());
  if(nativeWorkflow){
    const planner=app.linkMigrationExecutionPlanner(),plan=await planner.createPlan();
    assert.ok(plan.every(action=>["create","noop"].includes(action.action)),"Only fresh disposable link tables may be created");
    // Use the project's existing reviewed private-link DDL helper, as in the
    // production migrator. Upstream executePlan settles per-link errors.
    const {privateLinkSQL}=require("./sync-private-links.cjs");
    await db.query("begin");
    try{
      for(const action of plan){
        if(action.action==="create"){
          await db.query(privateLinkSQL(action));
          await db.query("insert into commerce.link_module_migrations(table_name,link_descriptor) values($1,$2) on conflict(table_name) do nothing",[action.tableName,action.linkDescriptor]);
        }
        assert.equal((await db.query("select to_regclass($1) is not null as present",[`commerce.${action.tableName}`])).rows[0].present,true);
      }
      await db.query("commit");
    }catch(error){await db.query("rollback");throw error;}
    // The installed Link planner closes its injected migration pool, too.
    // Recreate the native runtime with a fresh pool after planning/migration.
    await app.onApplicationShutdown();MedusaModule.clearInstances();knex=newPool();app=await MedusaApp(options());
  }
  const orders = app.modules[Modules.ORDER], payments = app.modules[Modules.PAYMENT];
  const reviewer = await app.modules[Modules.USER].createUsers({ email: "refund-reviewer@example.test" });
  const f = refundFixture({ duplicateSku: true }), { quote } = checkedTaxSaleSource(f.sale.source), native = nativeTaxQuotePlan(quote);
  const order = await orders.createOrders({ currency_code: "usd", customer_id: f.sale.source.customer_id,
    items: native.items.map((item, index) => ({ title: f.sale.source.input.lines[index].title, variant_id: f.sale.source.input.lines[index].variant_id,
      quantity: item.quantity, unit_price: item.unit_price, is_tax_inclusive: false, adjustments: item.adjustments,
      tax_lines: item.tax_lines.map(tax => ({ ...tax, provider_id: "snowforce_stripe_tax", metadata: { quote_id: f.sale.source.quote_id, cart_line_id: item.id } })) })) });
  const collection = await payments.createPaymentCollections({ amount: quote.amounts.total_cents / 100, currency_code: "usd" });
  const session = await payments.createPaymentSession(collection.id, { provider_id: "pp_stripe_stripe", amount: quote.amounts.total_cents / 100, currency_code: "usd", data: {} });
  const payment = await payments.authorizePaymentSession(session.id, {}); await payments.capturePayment({ payment_id: payment.id });
  if(nativeWorkflow)await app.link.create({[Modules.ORDER]:{order_id:order.id},[Modules.PAYMENT]:{payment_collection_id:collection.id}});
  const capture = (await db.query("select id,floor(extract(epoch from created_at))::bigint as created_at from commerce.capture where payment_id=$1", [payment.id])).rows[0];
  Object.assign(f.sale.source, { order_id: order.id, payment_id: payment.id, session_id: session.id, capture_id: capture.id, captured_at: Number(capture.created_at) });
  Object.assign(f.sale.snapshot.transaction, { posted_at: f.sale.source.captured_at, created: f.sale.source.captured_at + 10 });
  Object.assign(f.sale.snapshot.transaction.metadata, { snowforce_order: order.id, snowforce_capture: capture.id });
  f.sale.snapshot = assertTaxSaleTransaction(f.sale.source, f.sale.operation_id, f.sale.snapshot.transaction, f.sale.snapshot.lines);
  // Fixture prerequisite rows, not the complete production tax-sale/after-sales migrations.
  await db.query(`create table commerce.snowforce_tax_sale_tasks(id uuid primary key,order_id text,payment_id text,source jsonb,source_fingerprint text,request jsonb,request_fingerprint text,state text);
    create table commerce.snowforce_tax_sales(task_id uuid primary key,order_id text,account_id text,livemode boolean,transaction_id text,snapshot jsonb);
    ${completionOnly ? "" : "create table commerce.snowforce_after_sales(id uuid primary key,order_id text,kind text,items jsonb,status text,version integer,native_id text,created_at timestamptz)"}`);
  if(completionOnly){
    await app.modules[Modules.CUSTOMER].createCustomers({id:f.sale.source.customer_id,email:"completion-customer@example.test"});
    await db.query(readFileSync(new URL("../../../supabase/migrations/20261001073705_shop_after_sales_requests.sql",import.meta.url),"utf8"));
    // The modules verifier has no cross-module Link runtime. Use one explicit
    // order/payment link fixture; native records remain real Medusa records.
    await db.query("create table commerce.order_payment_collection(order_id text,payment_collection_id text,deleted_at timestamptz)");
    await db.query("insert into commerce.order_payment_collection values($1,$2,null)",[order.id,collection.id]);
    await db.query(readFileSync(new URL("../../../supabase/migrations/20261001212924_shop_refund_finality.sql",import.meta.url),"utf8"));
  }
  const request = taxSaleRequest(f.sale.source, f.sale.operation_id);
  await db.query("insert into commerce.snowforce_tax_sale_tasks values($1,$2,$3,$4,$5,$6,$7,'ready')", [f.sale.operation_id, order.id, payment.id, f.sale.source, taxSaleFingerprint(f.sale.source), request, taxSaleFingerprint(request)]);
  await db.query("insert into commerce.snowforce_tax_sales values($1,$2,$3,$4,$5,$6)", [f.sale.operation_id, order.id, f.sale.source.input.account_id, false, f.sale.snapshot.transaction.id, f.sale.snapshot]);
  const sourceScope = { resolve: () => ({ raw: (sql, values) => knex.raw(sql, values) }) };
  const readSource = () => readTaxRefundSource(sourceScope, order.id, async () => f.sale.source);
  const original = await readSource(), items = completionOnly ? [{id:original.bindings.find(line=>line.cart_line_id==="cali_sale").item_id,quantity:1}]
    : original.order_lines.map(line => ({ id: line.id, quantity: Number(line.quantity) }));
  await orders.registerFulfillment({ order_id: order.id, reference: "fulfillment", reference_id: "ful_fixture", items });
  const returned = await orders.createReturn({ order_id: order.id, items, created_by: reviewer.id });
  const caseId = randomUUID(), context = { case_id: caseId, case_version: 3, native_return_id: returned.id, staff_id: reviewer.id };
  if(completionOnly){
    await db.query("insert into commerce.snowforce_after_sales(id,order_id,customer_id,member_id,kind,reason,description,items,created_at) values($1,$2,$3,$4,'return','size','Local completion fixture',$5,clock_timestamp()-interval '1 minute')",[caseId,order.id,f.sale.source.customer_id,randomUUID(),JSON.stringify(items)]);
    await db.query("update commerce.snowforce_after_sales set status='approved',version=2,reviewed_by=$1,reviewed_at=clock_timestamp() where id=$2",[reviewer.id,caseId]);
    await db.query("update commerce.snowforce_after_sales set status='processing',version=3,native_id=$1 where id=$2",[returned.id,caseId]);
  }else await db.query("insert into commerce.snowforce_after_sales values($1,$2,'return',$3,'processing',3,$4,clock_timestamp()-interval '1 minute')", [caseId, order.id, JSON.stringify(items), returned.id]);
  await db.query(readFileSync(new URL("../../../supabase/migrations/20261009052229_shop_refund_allocations.sql", import.meta.url), "utf8"));
  for (const migration of ["20261009170338_shop_refund_tax_outbox.sql", "20261009220808_shop_refund_execution.sql", "20261009224620_shop_tracked_refund_continuation.sql", "20261009233013_shop_native_refund_bookkeeping_guards.sql"])
    await db.query(readFileSync(new URL(`../../../supabase/migrations/${migration}`, import.meta.url), "utf8"));
  // Simulate the private application role, with fixture native privileges only.
  await db.query("grant usage on schema commerce to snowforce_commerce; grant select,update on all tables in schema commerce to snowforce_commerce");
  const privateTransaction = action => knex.transaction(async trx => { await trx.raw("set local role snowforce_commerce"); return action(trx); });
  const scope = { resolve: () => ({ transaction: privateTransaction, raw: (sql, values) => privateTransaction(trx => trx.raw(sql, values)) }) };
  const selected = original.bindings.find(value => value.cart_line_id === "cali_sale"), input = { ...f.input, items: [{ item_id: selected.item_id, quantity: 1 }] };
  const reserve = (id, value = input) => reserveTaxRefund(scope, order.id, id, value, context, readSource);
  if(completionOnly){
    await orders.receiveReturn({return_id:returned.id,items});
    const first=await reserve(randomUUID()),started=await startTaxRefundReservation(scope,order.id,first.id,reviewer.id);
    const {verifyTaxRefundOutbox}=await import("./verify-tax-refund-outbox-steps.mjs");
    await verifyTaxRefundOutbox({scope,db,knex,orders,payments,started,f,order,payment,reviewer,completionCase:caseId,nativeRefundCallCount:()=>FixtureStripe.refundCalls});
  }else{
  await assert.rejects(() => reserve(randomUUID()));
  assert.equal(Number((await db.query("select count(*) from commerce.snowforce_refund_allocations")).rows[0].count), 0);
  await orders.receiveReturn({ return_id: returned.id, items: items.map(item => ({ ...item, quantity: item.id === selected.item_id ? 1 : item.quantity })) });
  const firstId = randomUUID(), first = await reserve(firstId); assert.equal(first.total_cents, 1052);
  await assert.rejects(() => reserve(randomUUID()));
  checks.push("actual requested returns cannot reserve until received; partial receipt caps reserved quantities");
  await orders.receiveReturn({ return_id: returned.id, items: [{ id: selected.item_id, quantity: 2 }] });
  const concurrent = await Promise.all([reserve(randomUUID()), reserve(randomUUID())]);
  assert.deepEqual(concurrent.map(row => row.total_cents).sort(), [1050, 1051]);
  await assert.rejects(() => reserve(randomUUID()));
  assert.equal(Number((await db.query("select sum(total_cents) from commerce.snowforce_refund_allocations")).rows[0].sum), 3153);
  checks.push("real concurrent transactions reserve distinct rounding positions and cannot over-refund received units");
  const restarted = await reserve(firstId); assert.deepEqual(restarted, first);
  await assert.rejects(() => reserve(firstId, { ...input, refund_shipping: true }));
  checks.push("reconstructed requests recover immutable allocation without replacing operation amounts");
  const history = (await db.query("select id,state from commerce.snowforce_refund_allocations order by sequence")).rows;
  await assert.rejects(() => cancelTaxRefundReservation(scope, order.id, firstId, reviewer.id, "Fixture reviewed cancellation"));
  const latest = history.at(-1), cancelled = await cancelTaxRefundReservation(scope, order.id, latest.id, reviewer.id, "Fixture reviewed cancellation");
  assert.equal(cancelled.state, "cancelled");
  const replacement = await reserve(randomUUID()); assert.equal(replacement.total_cents, 1050);
  await assert.rejects(() => reserve(latest.id));
  checks.push("latest untouched cancellation retains audit and releases only its original rounding prefix");
  const started = await startTaxRefundReservation(scope, order.id, firstId, reviewer.id); assert.equal(started.state, "started");
  assert.deepEqual(await startTaxRefundReservation(scope, order.id, firstId, reviewer.id), started);
  await assert.rejects(() => cancelTaxRefundReservation(scope, order.id, firstId, reviewer.id, "Fixture reviewed cancellation"));
  await recheckRefundExecutionApproval(scope, firstId);
  await db.query("update commerce.snowforce_after_sales set version=4 where id=$1", [caseId]);
  await assert.rejects(() => recheckRefundExecutionApproval(scope, firstId));
  await db.query("update commerce.snowforce_after_sales set version=3 where id=$1", [caseId]);
  checks.push("started reservations freeze quantities and attempt times; pre-POST approval recheck rejects a later changed case version");
  for (const sql of ["update commerce.snowforce_refund_allocations set total_cents=1 where id=$1", "update commerce.snowforce_refund_allocations set input='{}' where id=$1",
    "update commerce.snowforce_refund_allocations set first_attempt_at=clock_timestamp()+interval '1 day' where id=$1", "delete from commerce.snowforce_refund_allocations where id=$1"]) {
    await assert.rejects(() => db.query(sql, [firstId]), error => error.code === "23514");
  }
  await assert.rejects(() => db.query("update commerce.snowforce_refund_allocations set state='cancelled',cancelled_at=clock_timestamp(),cancellation_reason='Fixture cancellation' where id=$1", [history[1].id]), error => error.code === "23514");
  checks.push("database trigger rejects evidence edits, deleting audit, changing attempt times and unsafe earlier cancellation");
  if(nativeWorkflow){
    const {verifyInitialNativeRefundWorkflow}=await import("./verify-native-refund-workflow-steps.mjs");
    await verifyInitialNativeRefundWorkflow({app,scope,db,orders,payments,started,f,payment,reviewer,
      installVerifier:fn=>{FixtureStripe.refundVerifier=fn;},nativeRefundCallCount:()=>FixtureStripe.refundCalls});
  }
  if (process.argv.includes("--with-tax-outbox")) {
    const { verifyTaxRefundOutbox } = await import("./verify-tax-refund-outbox-steps.mjs");
    await verifyTaxRefundOutbox({ scope, db, knex, orders, payments, started, f, order, payment, reviewer, nativeRefundCallCount:()=>FixtureStripe.refundCalls });
  }
  await payments.refundPayment({ payment_id: payment.id, amount: 1 });
  await assert.rejects(() => startTaxRefundReservation(scope, order.id, replacement.id, reviewer.id));
  const second = original.bindings.find(value => value.cart_line_id === "cali_second");
  await assert.rejects(() => reserve(randomUUID(), { ...input, items: [{ item_id: second.item_id, quantity: 1 }] }));
  checks.push("untracked native payment refunds require reconciliation before further reservations");
  for (const role of ["anon", "authenticated", "service_role"]) {
    const privileges = (await db.query(`select has_table_privilege($1,'commerce.snowforce_refund_allocations','SELECT,INSERT,UPDATE,DELETE') as table_access,
      has_function_privilege($1,'commerce.guard_refund_allocation()','EXECUTE') as function_access`, [role])).rows[0];
    assert.equal(privileges.table_access, false); assert.equal(privileges.function_access, false);
  }
  assert.equal((await db.query("select prosecdef from pg_proc where oid='commerce.guard_refund_allocation()'::regprocedure")).rows[0].prosecdef, false);
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='commerce.snowforce_refund_allocations'::regclass")).rows[0].relrowsecurity, true);
  checks.push("private runtime role executes reservations; browser and service-role grants remain absent with RLS and invoker trigger");
  const report = { checkedAt: new Date().toISOString(), status: "passed", postgres: (await db.query("show server_version")).rows[0].server_version,
    medusa: require("@medusajs/order/package.json").version,
    scope: "disposable loopback database; actual Medusa order/return/payment/user migrations and APIs; fixture Stripe provider, captured source, committed tax-sale and after-sales rows; no production mutation or real provider HTTP", checks };
  writeFileSync(new URL("../../../output/shop-tax-refund-reservations-local-verification.json", import.meta.url), JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes("--with-runtime-dispatch")) {
    await app.onApplicationShutdown(); app = null; await knex.destroy(); MedusaModule.clearInstances(); knex = newPool();
    const apiKey = "rk_test_nativeruntimefixture", webhookSecret = "whsec_nativeruntimefixture";
    app = await MedusaApp(options({ ...modulesConfig, [Modules.PAYMENT]: { resolve: "@medusajs/payment", options: { providers: [{ resolve: require("../src/modules/snowforce-stripe/index.ts").default, id: "stripe", options: { apiKey, webhookSecret, capture: false } }] } } }));
    const { ContainerRegistrationKeys } = require("@medusajs/framework/utils"), { asValue } = require("awilix");
    const runtimeScope = app.sharedContainer.createScope();
    runtimeScope.register({ [ContainerRegistrationKeys.PG_CONNECTION]: asValue(knex) });
    const { configuredRefundAdapter } = require("../src/lib/refund-runtime.ts");
    const env = { COMMERCE_OPERATING_MODE: "sales", COMMERCE_REFUND_EXECUTION_ENABLED: "true", COMMERCE_STRIPE_API_KEY: apiKey, COMMERCE_STRIPE_WEBHOOK_SECRET: webhookSecret };
    const registered = configuredRefundAdapter(runtimeScope, env);
    assert.ok(registered, "Real native payment dispatch must resolve the registered adapter and shared database");
    assert.equal(registered.livemode, false);
    assert.equal(configuredRefundAdapter(runtimeScope, { ...env, COMMERCE_STRIPE_API_KEY: "rk_test_replacedfixture" }), null);
    assert.equal(configuredRefundAdapter(runtimeScope, { ...env, COMMERCE_OPERATING_MODE: "management" }), null);
    const savedEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
    try {
      Object.assign(process.env, env);
      const { adminRefundPlans } = require("../src/lib/refund-admin.ts");
      const plans = await adminRefundPlans(runtimeScope, { actor_type: "user", actor_id: reviewer.id }, caseId, async () => original);
      assert.equal(plans.execution_enabled, true);
      assert.ok(plans.plans.some(plan => plan.id === started.id));
      if (nativeWorkflow) assert.ok(plans.executions.some(task => task.id === started.id && task.state === "running" && task.tax_state === null));
      assert.ok(plans.plans.every(plan => !("source_data" in plan) && !("staff_id" in plan)));
    } finally {
      for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
    const runtimeReport = { checkedAt: new Date().toISOString(), status: "passed", medusa: require("@medusajs/payment/package.json").version,
      scope: "Actual MedusaApp/payment module and approved provider in disposable loopback PostgreSQL; fixture credentials; no Stripe HTTP or production mutations",
      checks: ["Actual native payment module dispatch resolves the approved instance with the same shared database connection", "Changed key and management mode reject execution", "Enabled staff refund page reads actual allocation, cash and tax task tables and returns sanitized plan/status data"], actual_stripe_api_calls: 0 };
    writeFileSync(new URL("../../../output/shop-refund-runtime-native-dispatch-verification.json", import.meta.url), JSON.stringify(runtimeReport, null, 2) + "\n");
    console.log(JSON.stringify(runtimeReport, null, 2));
  }
  }
} finally {
  if (app) await app.onApplicationShutdown(); if (knex) await knex.destroy(); if (db) await db.end();
  if (created) await admin.query(`drop database "${database}" with (force)`); await admin.end();
}
