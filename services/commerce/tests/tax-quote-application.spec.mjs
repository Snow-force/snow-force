import {createRequire} from "node:module";
import {test} from "node:test";
import assert from "node:assert/strict";
import {dirname,join} from "node:path";
import {auth} from "./fixtures/tax-source.mjs";
import {creationFixture} from "./fixtures/tax-creation.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const {decorateCartTotals}=require("@medusajs/utils");
const {createCartTaxQuote}=require("../src/lib/tax-quote-creation.ts");
const {applyCartTaxQuote}=require("../src/lib/tax-quote-application.ts");
const {assertPersistedCartTaxQuote}=require("../src/lib/tax-quote-ledger.ts");
const {readCartTaxQuoteSource}=require("../src/lib/tax-quote-source.ts");
const {readStripeTaxSetup}=require("../src/lib/tax-setup.ts");
const {checkoutCartSchema}=require("../src/lib/checkout-policy.ts");
const money=require("../src/lib/tax-quote-money.ts");
process.env.JWT_SECRET="fixture-atomic-tax-signing-secret-at-least-32-characters";

import {applicationFixture,withEnabled} from "./fixtures/tax-application.mjs";

test("applies tax when native graph omits the unlinked collection, retaining strict SQL validation", async () => {
  const f = await applicationFixture(), resolve = f.scope.resolve.bind(f.scope);
  f.scope = { resolve: (key, options) => {
    const dependency = resolve(key, options);
    return key !== "query" ? dependency : { graph: async request => {
      const result = await dependency.graph(request);
      if (request.entity === "cart") for (const cart of result.data) if (cart.payment_collection === null) delete cart.payment_collection;
      return result;
    } };
  } };
  const result = await withEnabled(() => applyCartTaxQuote(f.scope, auth, f.cart.id, f.prepared.quote_id));
  assert.equal(result.applied, true);
  assert.equal(f.applications.size, 1);
  money.assertNativeTaxQuoteAmounts(f.prepared.quote, f.cart);
});

test("native line and shipping taxes, private application and signed cart reference commit together",async()=>{
  const f=await applicationFixture(),result=await f.apply();
  assert.equal(result.applied,true);assert.equal(result.reused,false);assert.equal(f.applications.size,1);
  money.assertNativeTaxQuoteAmounts(f.prepared.quote,f.cart);assert.equal(f.cart.metadata.snowforce_tax_quote.quote_id,f.prepared.quote_id);
  for (const item of f.cart.items) assert.deepEqual(item.tax_lines[0].metadata,{quote_id:f.prepared.quote_id,cart_line_id:item.id});
  const {prepareLineItemData}=require(join(dirname(require.resolve("@medusajs/core-flows")),"cart/utils/prepare-line-item-data.js"));
  const nativeOrderLine=prepareLineItemData({item:f.cart.items[0],cartId:f.cart.id,unitPrice:f.cart.items[0].unit_price,taxLines:f.cart.items[0].tax_lines});
  assert.deepEqual(nativeOrderLine.tax_lines[0].metadata,f.cart.items[0].tax_lines[0].metadata);
  const before=f.writes.length,again=await f.apply();assert.equal(again.reused,true);assert.equal(f.writes.length,before);
  const proof=await assertPersistedCartTaxQuote(checkoutCartSchema.parse(f.cart),f.scope,await readStripeTaxSetup(f.setup));assert.equal(proof.receipt.quote_id,f.prepared.quote_id);
});

test("atomic tax application retires only an empty unfunded collection link and preserves the complete collection",async()=>{
  const f=await applicationFixture(),collection={id:"pay_col_fixture",amount:f.cart.total,currency_code:"usd",payment_sessions:[]};
  f.cart.payment_collection=structuredClone(collection);
  await f.apply();assert.equal(f.cart.payment_collection,null);assert.deepEqual(f.retiredCollections,[collection]);
  assert.equal(f.writes.filter(write=>write.sql.startsWith("delete from commerce.cart_payment_collection")).length,1);
  const failed=await applicationFixture({state:"CO",fee:28});failed.cart.payment_collection=structuredClone(collection);
  const before=structuredClone(failed.cart);failed.failWrite=8;await assert.rejects(()=>failed.apply());
  assert.deepEqual(failed.cart,before);assert.deepEqual(failed.retiredCollections,[]);assert.equal(failed.applications.size,0);
});

test("a separately verified government fee is a nondiscountable nonshipping custom line and its quote can be reused",async()=>{
  const f=await applicationFixture({state:"CO",fee:28}),result=await f.apply();
  assert.equal(result.amounts.merchandise_cents,9999);assert.equal(result.amounts.shipping_cents,995);assert.equal(result.amounts.government_fee_cents,28);
  const fee=f.cart.items.find(item=>item.variant_id===null);assert.equal(fee.is_discountable,false);assert.equal(fee.requires_shipping,false);assert.equal(fee.is_custom_price,true);assert.equal(money.exactTaxUsdCents(fee.unit_price),28);assert.equal(fee.quantity,1);
  money.assertNativeTaxQuoteAmounts(f.prepared.quote,f.cart);assert.equal((await f.apply()).reused,true);
  const {assertCartProductTaxClassifications}=require("../src/lib/tax-classification.ts"),{assertCartShippingCoverage}=require("../src/lib/shipping-coverage.ts"),{readCartItemCents}=require("../src/lib/shipping-quotes.ts");
  assert.equal((await assertCartProductTaxClassifications(checkoutCartSchema.parse(f.cart),f.scope)).length,1);
  await assertCartShippingCoverage(checkoutCartSchema.parse(f.cart),f.scope);assert.equal(await readCartItemCents(f.cart.id,f.scope),9999);
  const receipt=f.cart.metadata.snowforce_tax_quote;delete f.cart.metadata.snowforce_tax_quote;
  await assert.rejects(()=>assertCartProductTaxClassifications(checkoutCartSchema.parse(f.cart),f.scope));await assert.rejects(()=>readCartItemCents(f.cart.id,f.scope));f.cart.metadata.snowforce_tax_quote=receipt;
});

test("every failed or empty final write rolls back tax lines, fees, retired links and both proof records",async()=>{
  for(const step of [1,3,4,5,6,7]){
    const f=await applicationFixture({state:"CO",fee:28}),before=structuredClone(f.cart);f.failWrite=step;
    await assert.rejects(()=>f.apply(),error=>!error.message.includes("private-atomic"));assert.deepEqual(f.cart,before);assert.equal(f.applications.size,0);
  }
  const empty=await applicationFixture(),before=structuredClone(empty.cart);empty.emptyWrite=6;await assert.rejects(()=>empty.apply());assert.deepEqual(empty.cart,before);assert.equal(empty.applications.size,0);
});

test("existing payment/order/funds, invalid proof context, pending operations and credits prevent native writes",async()=>{
  for(const kind of ["session","funds","order","pending","namespace","owner","quote","credits"]){
    const f=await applicationFixture();let actor=auth,quoteId=f.prepared.quote_id;
    if(kind==="session")f.cart.payment_collection={payment_sessions:[{id:"payses_fixture"}]};
    if(kind==="funds")f.guard={has_collection_funds:true};if(kind==="order")f.guard={has_order:true};
    if(kind==="pending")f.operations.set("pending_fixture",{id:"pending_fixture",state:"pending"});
    if(kind==="namespace")f.writer.namespace="a".repeat(64);if(kind==="owner")actor={...auth,actor_id:"cus_other"};if(kind==="quote")quoteId="123e4567-e89b-42d3-a456-426614174099";
    if(kind==="credits")f.cart.credit_lines=[{id:"cacl_fixture",amount:1}];
    await assert.rejects(()=>f.apply(actor,quoteId));assert.equal(f.writes.length,0);assert.equal(f.applications.size,0);
  }
});

test("expiry, cancellation, flag disable and source mutation inside the transaction cannot commit a partial tax application",async()=>{
  for(const kind of ["clock","lease","flag","source"]){
    const f=await applicationFixture(),before=structuredClone(f.cart);
    if(kind==="source"){const original=f.scope;f.scope={resolve:(key,options)=>{const value=original.resolve(key,options);return key==="__pg_connection__"?{...value,transaction:async action=>{f.cart.shipping_address.address_1="Changed before row lock";return value.transaction(action);}}:value;}};}
    else f.onWrite=()=>{if(kind==="clock")f.clockShift=900;if(kind==="lease")f.controllers.at(-1).abort();if(kind==="flag")process.env.COMMERCE_TAX_POLICY_CONFIRMED="false";};
    await assert.rejects(()=>withEnabled(()=>applyCartTaxQuote(f.scope,auth,f.cart.id,f.prepared.quote_id)));
    if(kind!=="source")assert.deepEqual(f.cart,before);assert.equal(f.applications.size,0);
  }
});

test("unauthenticated actors and malformed IDs fail before resolving any dependency",async()=>{
  const scope={resolve:()=>assert.fail("No dependency expected")};
  for(const actor of [undefined,{actor_type:"user",actor_id:"user_fixture"}])await assert.rejects(()=>applyCartTaxQuote(scope,actor,"cart_fixture","123e4567-e89b-42d3-a456-426614174001"),/Sign in/);
  await assert.rejects(()=>applyCartTaxQuote(scope,auth,"foreign","123e4567-e89b-42d3-a456-426614174001"),/Invalid/);
  await assert.rejects(()=>applyCartTaxQuote(scope,auth,"cart_fixture","foreign"),/Invalid/);
});

test("source quoting rejects native credit lines rather than ignoring their effect on the payable total",async()=>{
  const f=creationFixture();f.cart.credit_lines=[{id:"cacl_fixture",amount:10}];
  await assert.rejects(()=>withEnabled(()=>readCartTaxQuoteSource(f.scope,auth,f.cart.id)));assert.equal(f.requests.length,0);
});
