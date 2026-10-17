import {createRequire} from "node:module";
import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,auth} from "./fixtures/tax-source.mjs";
import {nativeCart} from "./fixtures/tax-source.mjs";
import {quoteInput} from "./fixtures/tax-quote.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const {sealCheckoutDraft,openCheckoutDraft,checkoutDraftSchema,draftBaseline,CheckoutDraftChangedError}=require("../src/lib/checkout-draft-contract.ts");
const {readCartTaxPreviewSource}=require("../src/lib/tax-quote-source.ts");
const {checkoutDraftRoute}=require("../src/lib/checkout-draft-route.ts");
const {taxQuoteRebindFingerprint,buildStripeTaxQuoteRequest}=require("../src/lib/tax-quote-money.ts");
process.env.JWT_SECRET="checkout-draft-contract-fixture-secret-over-32-characters";
const address={first_name:"Fixture",last_name:"Rider",phone:"5551234567",address_1:"1 Test Street",address_2:"",city:"Fixture city",province:"ca",postal_code:"92614",country_code:"us"};
const payload=()=>({version:1,cartId:"cart_fixture",customerId:"cus_fixture",baseline:"a".repeat(64),identity:"e".repeat(64),draft:{kind:"delivery",version:"b".repeat(64),address},optionId:"so_fixture",quoteId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",setup:"c".repeat(64),namespace:"d".repeat(64),policyVersion:3,policyFingerprint:"f".repeat(64),expiresAt:Math.floor(Date.now()/1000)+900});
test("draft token is opaque, randomized and bound to cart, customer and expiry",()=>{
 const value=payload(),a=sealCheckoutDraft(value),b=sealCheckoutDraft(value);assert.notEqual(a,b);assert.ok(!a.includes("Fixture"));assert.deepEqual(openCheckoutDraft(a,value.cartId,value.customerId),value);
 for(const [cart,customer]of [["cart_other",value.customerId],[value.cartId,"cus_other"]])assert.throws(()=>openCheckoutDraft(a,cart,customer));
 assert.throws(()=>openCheckoutDraft(a,value.cartId,value.customerId,value.expiresAt-60));
});
test("tampering, malformed envelopes and key rotation reject a draft",()=>{
 const value=payload(),token=sealCheckoutDraft(value),parts=token.split(".");parts[2]=(parts[2][0]==="A"?"B":"A")+parts[2].slice(1);assert.throws(()=>openCheckoutDraft(parts.join("."),value.cartId,value.customerId));
 for(const raw of ["",token.replace("draft1.","draft2."),"draft1.YQ.YQ.YQ"])assert.throws(()=>openCheckoutDraft(raw,value.cartId,value.customerId));
 const key=process.env.JWT_SECRET;try{process.env.JWT_SECRET="rotated-draft-contract-fixture-key-over-32-characters";assert.throws(()=>openCheckoutDraft(token,value.cartId,value.customerId));process.env.JWT_SECRET="short";assert.throws(()=>sealCheckoutDraft(value));}finally{process.env.JWT_SECRET=key;}
});
test("receiving draft accepts no browser money and pickup requires an appointment",()=>{
 assert.equal(checkoutDraftSchema.parse(payload().draft).kind,"delivery");
 for(const raw of [{...payload().draft,totalCents:1},{...payload().draft,address:{...address,country_code:"ca"}},{...payload().draft,address:{...address,postal_code:"bad"}},{kind:"pickup",version:"b".repeat(64),contact:{name:"Fixture",phone:"5551234567",appointmentConfirmed:false}}])assert.equal(checkoutDraftSchema.safeParse(raw).success,false);
});
test("preview rebinding allows native identifiers but rejects same-net-price merchandise and review changes",()=>{
 const input=quoteInput(nativeCart(100,0,9.95)),hash=taxQuoteRebindFingerprint(input),transient={...input,tax_date:input.tax_date+10,cart_fingerprint:"e".repeat(64),shipping:{...input.shipping,id:"casm_new"}};assert.equal(taxQuoteRebindFingerprint(transient),hash);
 for(const change of [line=>{line.product_id="prod_other";},line=>{line.variant_id="variant_other";},line=>{line.title="Other gear";},line=>{line.classification_revision++;},line=>{line.classification_fingerprint="e".repeat(64);},line=>{line.unit_price_cents++;line.discount_cents++;}]){const changed=structuredClone(input);change(changed.lines[0]);assert.deepEqual(buildStripeTaxQuoteRequest(changed),buildStripeTaxQuoteRequest(input));assert.notEqual(taxQuoteRebindFingerprint(changed),hash);}
 assert.notEqual(taxQuoteRebindFingerprint({...input,configuration_revision:input.configuration_revision+1}),hash);
});
test("readonly tax source uses a server projection and leaves native cart untouched",async()=>{
 const f=fixture(),before=structuredClone(f.cart),old=process.env.COMMERCE_TAX_POLICY_CONFIRMED;process.env.COMMERCE_TAX_POLICY_CONFIRMED="true";
 try{const seen=[];const result=await readCartTaxPreviewSource(f.scope,auth,f.cart.id,{verifiedFeeIds:[],project:raw=>{seen.push(draftBaseline(raw));return {...raw,shipping_address:{...raw.shipping_address,address_2:"Estimate only"}};}});assert.equal(result.input.shipping_address.line2,"Estimate only");assert.equal(seen.length,2);assert.deepEqual(f.cart,before);}finally{if(old===undefined)delete process.env.COMMERCE_TAX_POLICY_CONFIRMED;else process.env.COMMERCE_TAX_POLICY_CONFIRMED=old;}
});
test("projection source still rejects owner changes and a changed baseline",async()=>{
 for(const ownerChange of [false,true]){const f=fixture(),old=process.env.COMMERCE_TAX_POLICY_CONFIRMED;process.env.COMMERCE_TAX_POLICY_CONFIRMED="true";let first;
 f.onCartRead=count=>{if(count===3){if(ownerChange)f.cart.customer_id="cus_other";else f.cart.shipping_address.address_1="Changed elsewhere";}};
 try{await assert.rejects(readCartTaxPreviewSource(f.scope,auth,f.cart.id,{verifiedFeeIds:[],project:raw=>{const hash=draftBaseline(raw);if(first&&hash!==first)throw Error("Baseline changed");first=hash;return raw;}}));}finally{if(old===undefined)delete process.env.COMMERCE_TAX_POLICY_CONFIRMED;else process.env.COMMERCE_TAX_POLICY_CONFIRMED=old;}}
});
test("draft route fails closed before invoking work when sales, tax or feature is off",async()=>{
 const previous={...process.env};try{process.env.COMMERCE_OPERATING_MODE="sales";process.env.COMMERCE_TAX_POLICY_CONFIRMED="true";process.env.COMMERCE_CHECKOUT_DRAFTS="true";let called=0;const route=checkoutDraftRoute(async()=>{called++;});const req={auth_context:auth},res={setHeader(){}};
 for(const [key,value]of [["COMMERCE_OPERATING_MODE","management"],["COMMERCE_TAX_POLICY_CONFIRMED","false"],["COMMERCE_CHECKOUT_DRAFTS","false"]]){const old=process.env[key];process.env[key]=value;await assert.rejects(route(req,res));process.env[key]=old;}assert.equal(called,0);
 await assert.rejects(route({auth_context:{actor_type:"user",actor_id:"user_fixture"}},res));assert.equal(called,0);
 }finally{for(const key of ["COMMERCE_OPERATING_MODE","COMMERCE_TAX_POLICY_CONFIRMED","COMMERCE_CHECKOUT_DRAFTS"]){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
test("draft routes distinguish a changed revision from an unavailable estimate without exposing errors",async()=>{
 const old=[process.env.COMMERCE_OPERATING_MODE,process.env.COMMERCE_TAX_POLICY_CONFIRMED,process.env.COMMERCE_CHECKOUT_DRAFTS];Object.assign(process.env,{COMMERCE_OPERATING_MODE:"sales",COMMERCE_TAX_POLICY_CONFIRMED:"true",COMMERCE_CHECKOUT_DRAFTS:"true"});
 try{for(const [error,code]of [[new CheckoutDraftChangedError(),"checkout_details_changed"],[new Error("private-provider-detail"),"checkout_estimate_unavailable"]]){let body,status;const response={setHeader(){},status(value){status=value;return response;},json(value){body=value;return response;}};await checkoutDraftRoute(async()=>{throw error;})({auth_context:auth},response);assert.equal(status,409);assert.equal(body.code,code);assert.ok(!JSON.stringify(body).includes("private-provider-detail"));}}
 finally{for(const [index,key]of ["COMMERCE_OPERATING_MODE","COMMERCE_TAX_POLICY_CONFIRMED","COMMERCE_CHECKOUT_DRAFTS"].entries()){if(old[index]===undefined)delete process.env[key];else process.env[key]=old[index];}}
});
