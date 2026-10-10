import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { executionFixture } from "./fixtures/refund-execution.mjs";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const { configuredRefundAdapter } = require("../src/lib/refund-runtime.ts");
const Candidate = require("../src/modules/snowforce-stripe/service.ts").default;
const { ContainerRegistrationKeys, Modules } = require("@medusajs/framework/utils");
const { processRefundExecution } = require("../src/lib/refund-execution.ts");
const { executeAdminRefund } = require("../src/lib/refund-admin.ts");
const job = require("../src/jobs/refunds.ts");
const env = { NODE_ENV: "production", COMMERCE_OPERATING_MODE: "sales", COMMERCE_REFUND_EXECUTION_ENABLED: "true", COMMERCE_STRIPE_API_KEY: "rk_test_runtimefixture", COMMERCE_STRIPE_WEBHOOK_SECRET: "whsec_runtimefixture" };
const options = key => ({ apiKey: key, webhookSecret: "whsec_runtimefixture", capture: false, automaticPaymentMethods: true });
function withEnvironment(t, values) {
  const prior = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  t.after(() => { for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
}
function registered(key = env.COMMERCE_STRIPE_API_KEY, db = {}) {
  const owner = { __container__: {}, retrieveProvider(id) { return this.__container__[id]; } };
  const provider = new Candidate({ [ContainerRegistrationKeys.PG_CONNECTION]: db, paymentProviderService: owner }, options(key));
  owner.__container__.pp_stripe_stripe = provider;
  return { provider, db, owner, scope: { resolve: name => { if (name === Modules.PAYMENT) return { paymentProviderService_: owner }; assert.equal(name, ContainerRegistrationKeys.PG_CONNECTION); return db; } } };
}

test("refund execution disabled, management and incomplete credentials reject before database resolution", () => {
  const scope = { resolve: () => assert.fail("No disabled runtime access") };
  for (const patch of [{ COMMERCE_REFUND_EXECUTION_ENABLED: "false" }, { COMMERCE_OPERATING_MODE: "management" }, { COMMERCE_STRIPE_API_KEY: "pk_test_fixture" }, { COMMERCE_STRIPE_WEBHOOK_SECRET: "" }]) assert.equal(configuredRefundAdapter(scope, { ...env, ...patch }), null);
});
test("runtime requires the actual adapter for the same database connection and configured key", () => {
  const f = registered(); assert.equal(configuredRefundAdapter(f.scope, env).livemode, false);
  assert.equal(configuredRefundAdapter({ resolve: () => ({}) }, env), null);
  assert.equal(configuredRefundAdapter({ resolve: () => null }, env), null);
  assert.equal(configuredRefundAdapter(f.scope, { ...env, COMMERCE_STRIPE_API_KEY: "rk_test_otherfixture" }), null);
  new Candidate({ [ContainerRegistrationKeys.PG_CONNECTION]: f.db }, options("rk_test_replacedfixture"));
  assert.equal(configuredRefundAdapter(f.scope, env).livemode, false);
  f.owner.__container__.pp_stripe_stripe = {};
  assert.equal(configuredRefundAdapter(f.scope, env), null);
});

test("an adapter constructed for the same database cannot authorize a stock or different loaded provider", () => {
  const f = registered();
  f.owner.__container__.pp_stripe_stripe = new Candidate({ [ContainerRegistrationKeys.PG_CONNECTION]: {} }, options(env.COMMERCE_STRIPE_API_KEY));
  assert.equal(configuredRefundAdapter(f.scope, env), null);
  f.owner.__container__.pp_stripe_stripe = new Candidate({ [ContainerRegistrationKeys.PG_CONNECTION]: f.db }, options("rk_test_differentkey"));
  assert.equal(configuredRefundAdapter(f.scope, env), null);
  delete f.owner.__container__.pp_stripe_stripe;
  assert.equal(configuredRefundAdapter(f.scope, env), null);
  assert.equal(configuredRefundAdapter({ resolve: () => { throw new Error("Missing payment module"); } }, env), null);
});
test("a registered live key reports its actual environment without making a funds request", () => {
  const f = registered("rk_live_runtimefixture");
  assert.equal(configuredRefundAdapter(f.scope, { ...env, COMMERCE_STRIPE_API_KEY: "rk_live_runtimefixture" }).livemode, true);
  assert.equal(f.provider.refundFundsReader().livemode, true);
  assert.equal(f.provider.refundFundsReader().createRefund, undefined);
});
test("enabled native executor reaches an empty durable queue without Stripe HTTP or a custom bookkeeper", async t => {
  withEnvironment(t, env); let reads = 0;
  const db = { transaction: action => action(db), raw: async sql => { assert.match(sql, /skip locked/); reads++; return { rows: [] }; } };
  const f = registered(env.COMMERCE_STRIPE_API_KEY, db);
  assert.equal(await processRefundExecution(f.scope), null); assert.equal(reads, 1);
  await assert.rejects(() => processRefundExecution(f.scope, { livemode: true })); assert.equal(reads, 1);
});
test("stock or absent provider cannot start native dispatch even with enabled flags", async t => {
  withEnvironment(t, env);
  await assert.rejects(() => processRefundExecution({ resolve: () => ({ raw: () => assert.fail("No queue access") }) }));
});
test("refund job exits before database, Stripe and queue access when disabled", async t => {
  withEnvironment(t, { COMMERCE_REFUND_EXECUTION_ENABLED: "false" });
  await job.default({ resolve: () => assert.fail("No disabled job access") });
  assert.equal(job.config.schedule, "*/2 * * * *");
});
test("execute command validates staff, explicit amount confirmation and immutable body before dependencies", async () => {
  const scope = { resolve: () => assert.fail("Unauthorized or malformed command reached dependencies") };
  const id = "123e4567-e89b-42d3-a456-426614174001", body = { version: 3, allocation_fingerprint: "a".repeat(64), confirmed: true };
  for (const auth of [undefined, { actor_type: "customer", actor_id: "cus_fixture" }]) await assert.rejects(() => executeAdminRefund(scope, auth, id, id, body));
  for (const patch of [{ confirmed: false }, { amount: 1 }, { version: 0 }, { allocation_fingerprint: "bad" }]) await assert.rejects(() => executeAdminRefund(scope, { actor_type: "user", actor_id: "user_fixture" }, id, id, { ...body, ...patch }));
});
test("execute route is private, accepted-only and explicitly authenticated", async () => {
  const route = require("../src/api/admin/snowforce/after-sales/[id]/refunds/[operation]/execute/route.ts");
  const headers = [];
  await assert.rejects(() => route.POST({ scope: { resolve: () => assert.fail() }, params: {}, body: {} }, { setHeader: (...args) => headers.push(args), status: () => ({ json: () => assert.fail("No unauthenticated success") }) }));
  assert.deepEqual(headers, [["Cache-Control", "private, no-store"]]);
  const middleware = readFileSync(new URL("../src/api/middlewares.ts", import.meta.url), "utf8");
  assert.match(middleware, /after-sales\/:id\/refunds\/:operation\/execute/);
  assert.match(middleware, /authenticate\("user", \["session", "bearer"\]\)/);
});

test("staff execution queues the same reviewed operation on retries and refuses another case or reviewer",async t=>{
  withEnvironment(t,env);const f=executionFixture(),original=f.db;let inserts=0,caseStatus="processing";
  const db={transaction:action=>original.transaction(()=>action(db)),raw:async(sql,values=[])=>{
    if(sql.startsWith("select id,order_id,version"))return{rows:[{id:f.reservation.case_id,order_id:f.reservation.order_id,version:f.reservation.case_version,kind:"return",status:caseStatus,native_id:f.reservation.native_return_id}]};
    if(sql.includes("from commerce.snowforce_refund_allocations where id=? and case_id=?"))return{rows:values[1]===f.reservation.case_id?[f.reservation]:[]};
    if(sql.startsWith("insert into commerce.snowforce_refund_executions")){assert.match(sql,/on conflict\(id\) do nothing/);assert.equal(values[0],f.reservation.id);inserts++;return{rows:[]};}
    return original.raw(sql,values);
  }};
  const {scope}=registered(env.COMMERCE_STRIPE_API_KEY,db),auth={actor_type:"user",actor_id:f.reservation.staff_id},body={version:f.reservation.case_version,allocation_fingerprint:f.reservation.allocation_fingerprint,confirmed:true};
  for(let retry=0;retry<2;retry++){const result=await executeAdminRefund(scope,auth,f.reservation.case_id,f.reservation.id,body);assert.equal(result.execution.id,f.reservation.id);assert.equal(result.execution.total_cents,1052);}
  assert.equal(inserts,2);assert.equal(f.moneyPosts.length,0);
  await assert.rejects(()=>executeAdminRefund(scope,{actor_type:"user",actor_id:"user_other"},f.reservation.case_id,f.reservation.id,body));
  await assert.rejects(()=>executeAdminRefund(scope,auth,"123e4567-e89b-42d3-a456-426614174099",f.reservation.id,body));
  await assert.rejects(()=>executeAdminRefund(scope,auth,f.reservation.case_id,f.reservation.id,{...body,version:body.version+1}),error=>error.type==="conflict");
  caseStatus="completed";
  await assert.rejects(()=>executeAdminRefund(scope,auth,f.reservation.case_id,f.reservation.id,body),error=>error.type==="conflict");
  assert.equal(inserts,2);assert.equal(f.moneyPosts.length,0);
});

test("enabled scheduled job checks both durable queues without creating an unrelated refund",async t=>{
  withEnvironment(t,env);const queries=[];
  const db={transaction:action=>action(db),raw:async sql=>{queries.push(sql);return{rows:[]};}};
  await job.default(registered(env.COMMERCE_STRIPE_API_KEY,db).scope);
  assert.equal(queries.length,2);assert.match(queries[0],/snowforce_refund_executions/);assert.match(queries[1],/snowforce_refund_tax_tasks/);
});
