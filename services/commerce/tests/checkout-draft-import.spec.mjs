import {createRequire} from "node:module";
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {creationFixture} from "./fixtures/tax-creation.mjs";
import {auth} from "./fixtures/tax-source.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const {importCheckoutPreview,resumePendingDraftQuote}=require("../src/lib/tax-quote-preview-import.ts"),{readStripeTaxSetup}=require("../src/lib/tax-setup.ts"),{draftBaseline}=require("../src/lib/checkout-draft-contract.ts");
test("explicit final review resumes only its owned pending native request and preserves recovery failures",async()=>{
 const id="cart_fixture",signals=[new AbortController().signal];let pending=false,calls=0,fail=false;const scope={resolve:key=>{assert.equal(key,"__pg_connection__");return {raw:async(sql,values)=>{assert.ok(sql.includes("customer_id=? and state='pending'"));assert.deepEqual(values,[id,auth.actor_id]);return {rows:pending?[{id:"pending_fixture"}]:[]};}};}},refresh=async(s,a,cart,leases)=>{assert.equal(s,scope);assert.equal(a,auth);assert.equal(cart,id);assert.equal(leases,signals);calls++;if(fail)throw Error("native response remains unknown");};
 await resumePendingDraftQuote(scope,auth,id,signals,refresh);assert.equal(calls,0);pending=true;await resumePendingDraftQuote(scope,auth,id,signals,refresh);assert.equal(calls,1);fail=true;await assert.rejects(resumePendingDraftQuote(scope,auth,id,signals,refresh),/remains unknown/);assert.equal(calls,2);
});
test("preview import rejects changed identity, contact, destination or option before consulting or applying a preview",async()=>{
 const old=process.env.COMMERCE_TAX_POLICY_CONFIRMED;process.env.COMMERCE_TAX_POLICY_CONFIRMED="true";
 try{for(const kind of ["email","region","phone","name","address","option"]){const f=creationFixture(),setup=await readStripeTaxSetup(f.setup),receiving={kind:"delivery",version:"a".repeat(64),address:structuredClone(f.cart.shipping_address)},identity=draftBaseline({email:f.cart.email,region:f.cart.region_id}),option=f.cart.shipping_methods[0].shipping_option_id;
 if(kind==="email")f.cart.email="changed@example.test";if(kind==="region")f.cart.region_id="reg_other";if(kind==="phone")f.cart.shipping_address.phone="5557654321";if(kind==="name")f.cart.shipping_address.first_name="Other";if(kind==="address")f.cart.shipping_address.address_2="Other draft";if(kind==="option"){f.cart.shipping_methods[0].shipping_option_id="so_other";f.option.id="so_other";}
 const create=importCheckoutPreview("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",setup.fingerprint,f.writer.namespace,receiving,option,identity);await assert.rejects(create(f.scope,auth,f.cart.id));assert.equal(f.requests.length,0,kind);assert.equal(f.operations.size,0,kind);
 }}finally{if(old===undefined)delete process.env.COMMERCE_TAX_POLICY_CONFIRMED;else process.env.COMMERCE_TAX_POLICY_CONFIRMED=old;}
});
test("draft migration is private, bounded and immutable without public security-definer functions",()=>{
 const sql=readFileSync(new URL("../../../supabase/migrations/20261017232618_shop_checkout_quote_drafts.sql",import.meta.url),"utf8");
 for(const text of ["create table commerce.snowforce_checkout_quote_drafts","enable row level security","owner to snowforce_commerce","from public,anon,authenticated,service_role","before update or delete","expires_at<=(input->>'tax_date')::bigint+900","old.state<>'pending'","new.state<>'ready'"])assert.ok(sql.includes(text),text);
 assert.ok(!/security definer|create policy|grant .* to (anon|authenticated|service_role)|create table public\./i.test(sql));
});
