import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { configuration as service,contract,warehouseFixture,shippingCodeFixture,businessPolicyMetadata,configuredMetadata,configurationSetup } from "./fixtures/tax-configuration.mjs";
import { setupReaderFixture } from "./fixtures/tax-setup.mjs";
import { quoteInput } from "./fixtures/tax-quote.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const {checkoutCartSchema}=require("../src/lib/checkout-policy.ts");
const auth={actor_type:"user",actor_id:"user_fixture"},requestId="123e4567-e89b-42d3-a456-426614174021";
function fixture(metadata={...businessPolicyMetadata(),snowforce_fulfillment_location_id:"sloc_fixture"}){
  const f={store:{id:"store_fixture",metadata,database_now:new Date().toISOString()},warehouse:warehouseFixture(),depth:0,reads:0,writes:0,providerCalls:0,failWrite:false,setup:setupReaderFixture(),onTransaction:null};
  const db={transaction:async action=>{const before=structuredClone(f.store),writes=f.writes;f.depth++;try{f.onTransaction?.();return await action(db);}catch(error){f.store=before;f.writes=writes;throw error;}finally{f.depth--;}}
    ,raw:async(sql,values=[])=>{f.reads++;
      if(sql.startsWith("select id,metadata,clock_timestamp()"))return {rows:[structuredClone(f.store)]};
      if(sql.includes("from commerce.stock_location l left join"))return {rows:f.warehouse?[structuredClone(f.warehouse)]:[]};
      if(sql.endsWith("for update")){assert.equal(f.depth,1);return {rows:[{id:values[0]}]};}
      if(sql.startsWith("update commerce.store set metadata=jsonb_set")){assert.equal(f.depth,1);if(f.failWrite)return {rows:[]};f.writes++;f.store.metadata={...f.store.metadata,[contract.taxConfigurationKey]:JSON.parse(values[0])};return {rows:[structuredClone(f.store)]};}
      assert.fail("Unexpected SQL");}};
  f.db=db;f.scope={resolve:key=>key==="__pg_connection__"?db:key==="snowforce_tax_setup_reader"?f.setup:assert.fail("Unexpected dependency")};
  f.reader={retrieve:async id=>{assert.equal(f.depth,0);f.providerCalls++;assert.equal(id,shippingCodeFixture().id);return shippingCodeFixture();},list:async()=>assert.fail("No full catalog during activation")};
  return f;
}
const draft=()=>({legal_seller_name:"Fixture seller",stock_location_id:"sloc_fixture",shipping_tax_code:"txcd_92010001",california_permit_confirmed:true,california_permit_type:"ongoing",california_permit_valid_from:"2025-01-01",california_permit_valid_through:null,obligations_reviewed:true,shipping_tax_treatment_reviewed:true,review_note:"Reviewed fixture permit, obligations and shipping category conditions."});
const save=(content=draft())=>({command:"save_draft",request_id:requestId,expected_revision:0,content});
async function activation(f){const loaded=await service.adminTaxConfiguration(f.scope,auth);return {command:"activate",request_id:"123e4567-e89b-42d3-a456-426614174022",expected_revision:loaded.state.revision,source_fingerprint:loaded.source_fingerprint,confirm_review:true};}
test("initial admin configuration is an unconfirmed draft with the actual warehouse and no default tax code",async()=>{
  const f=fixture(),loaded=await service.adminTaxConfiguration(f.scope,auth);assert.equal(loaded.persisted,false);assert.equal(loaded.state.active_revision,null);assert.equal(loaded.state.draft.stock_location_id,f.warehouse.id);assert.equal(loaded.state.draft.shipping_tax_code,null);assert.equal(loaded.state.draft.legal_seller_name,"");assert.equal(loaded.state.draft.california_permit_confirmed,false);assert.equal(f.writes,0);assert.equal(f.providerCalls,0);assert.equal(loaded.warehouse.address.address_1,"1 Test Street");
});
test("actor and command boundaries precede any private read or provider access",async()=>{
  const f=fixture();for(const actor of [undefined,{actor_type:"customer",actor_id:"user_fixture"},{actor_type:"user",actor_id:"cus_fixture"}]){await assert.rejects(()=>service.adminTaxConfiguration(f.scope,actor));await assert.rejects(()=>service.changeTaxConfiguration(f.scope,actor,save(),f.reader));}
  for(const body of [{...save(),unknown:true},{...save(),request_id:"invalid"},{command:"activate",request_id:requestId,expected_revision:0,source_fingerprint:"a".repeat(64),confirm_review:false}])await assert.rejects(()=>service.changeTaxConfiguration(f.scope,auth,body,f.reader));assert.equal(f.reads,0);assert.equal(f.providerCalls,0);
});
test("draft save preserves unrelated metadata and repeated UUID never advances revision twice",async()=>{
  const f=fixture();f.store.metadata.unrelated={keep:true};const content={...draft(),california_permit_confirmed:false};
  const first=await service.changeTaxConfiguration(f.scope,auth,save(content),f.reader),second=await service.changeTaxConfiguration(f.scope,auth,save(content),f.reader);
  assert.equal(first.state.revision,1);assert.equal(first.state.active_revision,null);assert.equal(second.replayed,true);assert.equal(second.applied_revision,1);assert.equal(f.writes,1);assert.deepEqual(f.store.metadata.unrelated,{keep:true});assert.equal(f.providerCalls,0);
  await assert.rejects(()=>service.changeTaxConfiguration(f.scope,auth,save({...content,legal_seller_name:"Changed"}),f.reader));await assert.rejects(()=>service.changeTaxConfiguration(f.scope,{...auth,actor_id:"user_other"},save(content),f.reader));
});
test("activation records reviewed native facts and exact official category; provider GET occurs outside the transaction",async()=>{
  const f=fixture();await service.changeTaxConfiguration(f.scope,auth,save(),f.reader);const command=await activation(f),first=await service.changeTaxConfiguration(f.scope,auth,command,f.reader);
  assert.equal(first.state.active_revision,2);assert.equal(first.state.publications[0].content.legal_seller_name,"Fixture seller");assert.deepEqual(first.state.publications[0].ship_from_address,service.warehouseTaxAddress(f.warehouse));assert.equal(first.state.publications[0].account_id,"acct_fixture");assert.equal(first.state.publications[0].livemode,false);assert.equal(f.providerCalls,1);
  const replay=await service.changeTaxConfiguration(f.scope,auth,command,{retrieve:async()=>assert.fail("Replay cannot require another provider read")});assert.equal(replay.replayed,true);assert.equal(replay.applied_revision,2);assert.equal(f.writes,2);
});
test("incomplete business, permit, obligations, shipping treatment or review basis cannot activate",async()=>{
  for(const patch of [{legal_seller_name:""},{stock_location_id:null},{shipping_tax_code:null},{california_permit_confirmed:false},{obligations_reviewed:false},{shipping_tax_treatment_reviewed:false},{review_note:"too short"}]){const f=fixture();await service.changeTaxConfiguration(f.scope,auth,save({...draft(),...patch}),f.reader);const command=await activation(f);await assert.rejects(()=>service.changeTaxConfiguration(f.scope,auth,command,f.reader),/Complete the legal seller/);assert.equal(f.writes,1);assert.equal(f.providerCalls,0);}
});

test("missing dates, future or expired permits cannot activate or authorize new quotes",async()=>{
  for(const patch of [{california_permit_type:null},{california_permit_valid_from:null},{california_permit_valid_from:"2099-01-01"},{california_permit_type:"temporary",california_permit_valid_through:null},{california_permit_type:"temporary",california_permit_valid_through:"2025-01-02"}]){
    const f=fixture();await service.changeTaxConfiguration(f.scope,auth,save({...draft(),...patch}),f.reader);
    const command=await activation(f);
    await assert.rejects(()=>service.changeTaxConfiguration(f.scope,auth,command,f.reader));
    assert.equal(f.writes,1);assert.equal(f.providerCalls,0);
    const configured=fixture(configuredMetadata());
    Object.assign(configured.store.metadata.snowforce_tax_configuration.publications[0].content,patch);
    await assert.rejects(()=>service.readReviewedTaxConfiguration(configured.scope,configurationSetup),/current, reviewed business/);
  }
});

test("temporary permit expiry between Stripe lookup and activation rolls back the publication",async()=>{
  const f=fixture();f.store.database_now="2027-01-05T07:59:59.000Z";
  await service.changeTaxConfiguration(f.scope,auth,save({...draft(),california_permit_type:"temporary",california_permit_valid_from:"2026-10-07",california_permit_valid_through:"2027-01-04"}),f.reader);
  const command=await activation(f);
  f.onTransaction=()=>{f.store.database_now="2027-01-05T08:00:00.000Z";};
  await assert.rejects(()=>service.changeTaxConfiguration(f.scope,auth,command,f.reader),/verified current permit/);
  assert.equal(f.writes,1);assert.equal(f.store.metadata.snowforce_tax_configuration.active_revision,null);
});
test("unpublished or different policy seller, unavailable warehouse and stale source cannot activate",async()=>{
  for(const kind of ["policy","seller","warehouse","address","source"]){const f=fixture();await service.changeTaxConfiguration(f.scope,auth,save(),f.reader);const command=await activation(f);
    if(kind==="policy")f.store.metadata=Object.fromEntries(Object.entries(f.store.metadata).filter(([key])=>key!=="snowforce_shop_policy"));
    if(kind==="seller")f.store.metadata.snowforce_shop_policy.publications[0].content.seller_name="Different seller";
    if(kind==="warehouse")f.warehouse=null;if(kind==="address")f.warehouse.address.postal_code="";
    if(kind==="source")command.source_fingerprint="a".repeat(64);
    await assert.rejects(()=>service.changeTaxConfiguration(f.scope,auth,command,f.reader));assert.equal(f.writes,1);
  }
});
test("actual Stripe prerequisites and official-code errors cannot mutate the configuration",async()=>{
  for(const kind of ["registrations","unsupported","mismatch","location","network"]){const f=fixture();await service.changeTaxConfiguration(f.scope,auth,save(),f.reader);const command=await activation(f);
    if(kind==="registrations")f.setup=setupReaderFixture([]);
    if(kind==="unsupported")f.reader.retrieve=async()=>({...shippingCodeFixture(),id:"txcd_00000000"});
    if(kind==="mismatch")f.reader.retrieve=async()=>({...shippingCodeFixture(),id:"txcd_92010000"});
    if(kind==="location")f.reader.retrieve=async()=>({...shippingCodeFixture(),requirements:{performance_location:"required"}});
    if(kind==="network")f.reader.retrieve=async()=>{throw new Error("private-provider-detail");};
    await assert.rejects(()=>service.changeTaxConfiguration(f.scope,auth,command,f.reader),error=>!error.message.includes("private-provider"));assert.equal(f.writes,1);
  }
});
test("warehouse and draft changing after provider lookup are rechecked under native row locks",async()=>{
  for(const kind of ["warehouse","draft","clock"]){const f=fixture();await service.changeTaxConfiguration(f.scope,auth,save(),f.reader);const command=await activation(f);
    f.onTransaction=()=>{if(kind==="warehouse")f.warehouse.address.address_1="2 Changed Street";if(kind==="draft")f.store.metadata.snowforce_tax_configuration.revision++;if(kind==="clock")f.store.database_now=new Date(Date.now()+120000).toISOString();};
    await assert.rejects(()=>service.changeTaxConfiguration(f.scope,auth,command,f.reader),/changed/);assert.equal(f.writes,1);
  }
});
test("database update failure rolls back; stale revision does not initiate provider lookup",async()=>{
  const f=fixture();f.failWrite=true;await assert.rejects(()=>service.changeTaxConfiguration(f.scope,auth,save(),f.reader));assert.equal(f.store.metadata.snowforce_tax_configuration,undefined);assert.equal(f.writes,0);
  await assert.rejects(()=>service.changeTaxConfiguration(f.scope,auth,{...save(),expected_revision:1},f.reader));assert.equal(f.providerCalls,0);
});
function quoteCart(){return checkoutCartSchema.parse({id:"cart_fixture",customer_id:"cus_fixture",currency_code:"usd",region_id:"reg_fixture",email:"fixture@example.test",completed_at:null,total:109.95,subtotal:100,tax_total:0,shipping_total:9.95,discount_total:0,item_total:100,item_tax_total:0,shipping_address:{first_name:"Fixture",last_name:"Rider",address_1:"1 Test Street",address_2:"",city:"Fixture city",province:"ca",postal_code:"92614",country_code:"us",phone:"5551234567"},shipping_methods:[{id:"casm_fixture",shipping_option_id:"so_fixture",name:"US standard",amount:9.95}],items:[{id:"cali_fixture",variant_id:"variant_fixture",product_handle:"fixture",product_title:"Fixture gear",title:"Fixture gear",variant_title:"M",thumbnail:null,quantity:1,unit_price:100,total:100}],payment_collection:null});}
test("quote acceptance binds current controlled configuration, published seller and native ship-from address",async()=>{
  const f=fixture(configuredMetadata()),input=quoteInput(quoteCart());const active=await service.assertQuotedTaxConfiguration(f.scope,input,configurationSetup);assert.equal(active.revision,2);
  for(const patch of [{configuration_revision:1},{shipping:{...input.shipping,tax_code:"txcd_00000000"}},{account_id:"acct_other"},{livemode:true},{ship_from_address:{...input.ship_from_address,line1:"Unrelated origin"}},{tax_date:1}])await assert.rejects(()=>service.assertQuotedTaxConfiguration(f.scope,{...input,...patch},configurationSetup));
  f.warehouse.address.address_1="2 Changed Street";await assert.rejects(()=>service.assertQuotedTaxConfiguration(f.scope,input,configurationSetup));
});
test("draft-only and corrupted or unreviewed active metadata never supply confirmation flags to a quote",async()=>{
  for(const kind of ["draft","missing","unreviewed","code","policy","setup"]){const f=fixture(configuredMetadata()),input=quoteInput(quoteCart());let setup=configurationSetup;
    const state=f.store.metadata.snowforce_tax_configuration;
    if(kind==="draft")state.active_revision=null;if(kind==="missing")delete f.store.metadata.snowforce_tax_configuration;
    if(kind==="unreviewed")state.publications[0].content.obligations_reviewed=false;
    if(kind==="code")state.publications[0].content.shipping_tax_code="txcd_92010000";
    if(kind==="policy")delete f.store.metadata.snowforce_shop_policy;
    if(kind==="setup")setup={...setup,api_ready:false};
    await assert.rejects(()=>service.assertQuotedTaxConfiguration(f.scope,input,setup),/current, reviewed business/);
  }
});
test("malformed state, native warehouse or ambiguous store cannot become an empty ready result",async()=>{
  const f=fixture();f.store.metadata.snowforce_tax_configuration={schema_version:1};await assert.rejects(()=>service.adminTaxConfiguration(f.scope,auth),/unavailable/);
  delete f.store.metadata.snowforce_tax_configuration;f.warehouse.address.city=42;await assert.rejects(()=>service.adminTaxConfiguration(f.scope,auth),/unavailable/);
  f.db.raw=async()=>({rows:[]});await assert.rejects(()=>service.adminTaxConfiguration(f.scope,auth),/unavailable/);
});
test("state schema rejects duplicate receipts, future/reordered publication revisions and absent active history",()=>{
  const state=configuredMetadata().snowforce_tax_configuration;
  for(const patch of [{active_revision:3},{receipts:[state.receipts[0],state.receipts[0]]},{publications:[state.publications[0],state.publications[0]]},{revision:1}])assert.equal(contract.taxConfigurationStateSchema.safeParse({...state,...patch}).success,false);
});
