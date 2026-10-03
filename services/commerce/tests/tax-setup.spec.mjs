import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { registrationFixture as reg, settingsFixture, setupReaderFixture as reader, setupTime as now } from "./fixtures/tax-setup.mjs";
const require = createRequire(import.meta.url); require("ts-node/register/transpile-only");
const setup = require("../src/lib/tax-setup.ts");
const scope = value => ({ resolve: (key, options) => { assert.equal(key,setup.taxSetupReaderRegistration); assert.equal(options.allowUnregistered,true); return value; } });
const auth = { actor_type: "user", actor_id: "user_fixture" };

test("tax setup uses only GET resources and validates cursor and protected credentials", async () => {
  const calls = [], client = { accounts: { retrieveCurrent: async () => { calls.push("account"); return {}; } }, tax: {
    settings: { retrieve: async () => { calls.push("settings"); return {}; } }, registrations: { list: async input => { calls.push(input); return {}; }, create: () => assert.fail("no writes") } } };
  const api = setup.createStripeTaxSetupReader(client,false);
  await api.account(); await api.settings(); await api.registrations(); await api.registrations("taxreg_next");
  assert.deepEqual(calls,["account","settings",{ status:"all",limit:100 },{ status:"all",limit:100,starting_after:"taxreg_next" }]);
  assert.throws(() => api.registrations("invented")); assert.throws(() => setup.createStripeTaxSetupReader(client));
  const previous = process.env.COMMERCE_STRIPE_API_KEY;
  try { for (const key of [undefined,"pk_test_fixture","invalid"]) { if(key===undefined)delete process.env.COMMERCE_STRIPE_API_KEY; else process.env.COMMERCE_STRIPE_API_KEY=key; assert.throws(() => setup.createStripeTaxSetupReader(),/could not be verified/); }
    process.env.COMMERCE_STRIPE_API_KEY="rk_test_fixture"; assert.equal(setup.createStripeTaxSetupReader().livemode,false);
    process.env.COMMERCE_STRIPE_API_KEY="rk_live_fixture"; assert.equal(setup.createStripeTaxSetupReader().livemode,true);
  } finally { if(previous===undefined)delete process.env.COMMERCE_STRIPE_API_KEY; else process.env.COMMERCE_STRIPE_API_KEY=previous; }
});
test("complete snapshot identifies account and mode without exposing account details", async () => {
  const snapshot = await setup.readStripeTaxSetup(reader(),() => now);
  assert.equal(snapshot.api_ready,true); assert.deepEqual(snapshot.collecting_states,["CA"]); assert.match(snapshot.fingerprint,/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(snapshot).includes("private_contact"));
  const changed = reader(); changed.settings=async()=>settingsFixture({ defaults:{provider:"stripe",tax_behavior:"exclusive",tax_code:null} });
  assert.notEqual((await setup.readStripeTaxSetup(changed,() => now)).fingerprint,snapshot.fingerprint);
  changed.settings=async()=>settingsFixture({head_office:{address:{country:"US",state:"CA",city:"Irvine",line1:"Fixture address",postal_code:"92614"}}});
  assert.notEqual((await setup.readStripeTaxSetup(changed,()=>now)).fingerprint,snapshot.fingerprint);
});
test("scheduled and expired dates cannot authorize collection, including expiry during pagination", async () => {
  for (const patch of [{active_from:now+60,status:"scheduled"},{expires_at:now,status:"expired"},{expires_at:now+299}]) {
    const snapshot = await setup.readStripeTaxSetup(reader([reg(patch)]),() => now); assert.equal(snapshot.api_ready,false);
  }
  let clockReads=0; const snapshot=await setup.readStripeTaxSetup(reader([reg({expires_at:now+1})]),()=>now+clockReads++*2);
  assert.equal(snapshot.registrations[0].status,"expired"); assert.deepEqual(snapshot.collecting_states,[]);
});
test("only supported active US sales-tax and retail-fee types count as collection evidence", async () => {
  const colorado=reg({id:"taxreg_co",country_options:{us:{state:"CO",type:"state_sales_tax"}}});
  const fee=reg({id:"taxreg_fee",country_options:{us:{state:"CO",type:"state_retail_delivery_fee"}}});
  const rows=[reg(),colorado,fee,reg({id:"taxreg_foreign",country:"CA",country_options:{ca:{type:"standard"}}})];
  const snapshot=await setup.readStripeTaxSetup(reader(rows),()=>now);
  assert.equal(snapshot.api_ready,true); assert.deepEqual(snapshot.collecting_states,["CA","CO"]); assert.deepEqual(snapshot.collecting_retail_fee_states,["CO"]);
  assert.equal(snapshot.fingerprint,(await setup.readStripeTaxSetup(reader([...rows].reverse()),()=>now)).fingerprint);
  const minnesota=[reg(),reg({id:"taxreg_mn",country_options:{us:{state:"MN",type:"state_sales_tax",state_sales_tax:{elections:[]}}}}),reg({id:"taxreg_mnfee",country_options:{us:{state:"MN",type:"state_retail_delivery_fee"}}})];
  assert.deepEqual((await setup.readStripeTaxSetup(reader(minnesota),()=>now)).collecting_retail_fee_states,["MN"]);
  for (const extra of [reg({id:"taxreg_unknown",country_options:{us:{state:"CA",type:"future_tax"}}}),reg({id:"taxreg_badstate",country_options:{us:{state:"XX",type:"state_sales_tax"}}}),fee,reg({id:"taxreg_duplicate"})]) {
    assert.equal((await setup.readStripeTaxSetup(reader([reg(),extra]),()=>now)).api_ready,false);
  }
});
test("pending settings, third-party providers and absent US location fail the setup gate", async () => {
  for (const patch of [{status:"pending",status_details:{pending:{missing_fields:["head_office"]}}},{defaults:{provider:"avalara",tax_behavior:null,tax_code:null}},{head_office:null},{head_office:{address:{country:"CA",state:"ON"}}},{head_office:{address:{country:"US",state:null}}}]) {
    const api=reader(); api.settings=async()=>settingsFixture(patch);
    assert.equal((await setup.readStripeTaxSetup(api,()=>now)).api_ready,false);
    await assert.rejects(()=>setup.assertActiveStripeTaxSetup(scope(api)),/needs active/);
  }
});
test("all registration pages are required and a partial, duplicate or stuck page is never returned", async () => {
  const next=reg({id:"taxreg_next",country_options:{us:{state:"NY",type:"state_sales_tax"}}}), cursors=[];
  const api=reader(); api.registrations=async cursor=>{cursors.push(cursor);return {object:"list",has_more:!cursor,data:[cursor?next:reg()]};};
  assert.equal((await setup.readStripeTaxSetup(api,()=>now)).registrations.length,2); assert.deepEqual(cursors,[undefined,"taxreg_fixture"]);
  for (const page of [{object:"list",has_more:true,data:[]},{object:"list",has_more:false,data:[reg(),reg()]},{object:"list",has_more:false,data:Array.from({length:101},(_,i)=>reg({id:`taxreg_${i}`}))},{object:"list",has_more:false,data:[reg({country_options:{}})]},{object:"list",has_more:false,data:[reg({livemode:true})]},{object:"list",has_more:false,data:[reg({expires_at:1})]}]) {
    const broken=reader(); broken.registrations=async()=>page; await assert.rejects(()=>setup.readStripeTaxSetup(broken,()=>now),/could not be verified/);
  }
  let count=0; const long=reader(); long.registrations=async()=>({object:"list",has_more:true,data:[reg({id:`taxreg_${count++}`})]});
  await assert.rejects(()=>setup.readStripeTaxSetup(long,()=>now)); assert.equal(count,20);
  const duplicate=reader(); duplicate.registrations=async()=>({object:"list",has_more:true,data:[reg()]}); await assert.rejects(()=>setup.readStripeTaxSetup(duplicate,()=>now));
});
test("failed, mixed-mode, malformed or slow snapshots discard all results and redact provider details", async () => {
  for (const key of ["account","settings","registrations"]) {const api=reader();api[key]=async()=>{throw new Error("sensitive provider credential");};await assert.rejects(()=>setup.readStripeTaxSetup(api,()=>now),error=>!error.message.includes("sensitive"));}
  const mixed=reader();mixed.settings=async()=>settingsFixture({livemode:true});await assert.rejects(()=>setup.readStripeTaxSetup(mixed,()=>now));
  const malformed=reader();malformed.account=async()=>({id:"acct_other",object:"customer"});await assert.rejects(()=>setup.readStripeTaxSetup(malformed,()=>now));
  for (const delta of [-1,61]) {let reads=0; await assert.rejects(()=>setup.readStripeTaxSetup(reader(),()=>now+reads++*delta));}
});
test("admin authentication precedes any network call and API readiness never enables checkout", async () => {
  for (const actor of [undefined,{actor_type:"customer",actor_id:"user_fixture"},{actor_type:"user",actor_id:"cus_fixture"}]) await assert.rejects(()=>setup.adminStripeTaxSetup({resolve:()=>assert.fail("Authenticate first")},actor),/Sign in/);
  const previous=process.env.COMMERCE_TAX_POLICY_CONFIRMED;
  try {process.env.COMMERCE_TAX_POLICY_CONFIRMED="true";const result=await setup.adminStripeTaxSetup(scope(reader()),auth);assert.equal(result.snapshot.api_ready,true);assert.equal(result.policy_confirmed,true);assert.equal(result.checkout_ready,false);assert.equal(result.integration_ready,false);
    process.env.COMMERCE_TAX_POLICY_CONFIRMED="false";assert.equal((await setup.adminStripeTaxSetup(scope(reader()),auth)).policy_confirmed,false);
    assert.equal((await setup.assertActiveStripeTaxSetup(scope(reader()))).account_id,"acct_fixture");
  } finally {if(previous===undefined)delete process.env.COMMERCE_TAX_POLICY_CONFIRMED;else process.env.COMMERCE_TAX_POLICY_CONFIRMED=previous;}
});
