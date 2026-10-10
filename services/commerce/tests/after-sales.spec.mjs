import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import {completedRefundFixture} from "./fixtures/completed-refund.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const {BigNumber,ContainerRegistrationKeys}=require("@medusajs/framework/utils");
const policy=require("../src/lib/after-sales-policy.ts");
const shopPolicy=require("../src/lib/shop-policy.ts"),consent=require("../src/lib/policy-consent.ts");
process.env.JWT_SECRET="fixture-policy-signing-key-32-characters-or-longer";
const acceptedAt="2026-09-01T08:00:00.000Z";
function policyMetadata(){const state=shopPolicy.initialShopPolicyState();state.revision=1;state.draft.version=1;state.published_version=1;const content=state.draft.content;content.seller_name="Fixture Seller";content.customer_service_email="support@example.test";content.copy.consumer_rights={en:"Your statutory consumer rights apply.",zh:"保留法定消费者权利。"};state.publications=[{version:1,published_at:acceptedAt,effective_at:acceptedAt,published_by:"user_fixture",content}];return {[shopPolicy.shopPolicyMetadataKey]:state};}
const signedMetadata=()=>({[consent.policyAcceptanceKey]:consent.sealPolicyAcceptance({id:"cart_fixture",customer_id:"cus_fixture",items:[],shipping_methods:[]},shopPolicy.publishedShopPolicy(policyMetadata(),acceptedAt),acceptedAt)});
const flowsPath=require.resolve("@medusajs/medusa/core-flows"),flows=require(flowsPath);let native;
require.cache[flowsPath].exports={...flows,getOrderDetailWorkflow:()=>({run:async({input})=>{if(input.filters?.customer_id&&input.filters.customer_id!==native.customer_id)throw new Error("Not found");assert.ok(input.fields.includes("items.*"),"Native item projection requires its current versioned detail relationship");return {result:native};}})};
const service=require("../src/lib/after-sales.ts");require.cache[flowsPath].exports=flows;
const {GET:customerGET,POST:customerPOST}=require("../src/api/store/snowforce/orders/[id]/after-sales/route.ts");
const {GET:adminGET}=require("../src/api/admin/snowforce/after-sales/route.ts");
const {POST:fundsPOST}=require("../src/api/admin/snowforce/after-sales/[id]/funds/route.ts");
const {useAfterSalesBoundary}=require("../src/api/after-sales-boundary.ts");
const member="11111111-1111-4111-8111-111111111111",key="22222222-2222-4222-8222-222222222222",at="2026-10-01T08:00:00.000Z";
const input=()=>({requestKey:key,kind:"return",reason:"size",description:"Need a different fit",items:[{id:"ordli_fixture",quantity:1}]});
const row=()=>({id:key,order_id:"order_fixture",customer_id:"cus_fixture",member_id:member,kind:"return",reason:"size",description:"Need a different fit",items:input().items,status:"pending",version:1,customer_message:"",internal_note:"private staff note",native_id:null,return_carrier:"",return_tracking_number:"",created_at:at,updated_at:at,reviewed_by:null,reviewed_at:null,history:[{status:"pending",message:"",at}]});
const reader=()=>({livemode:false,retrieveIntent:async(id)=>({id,currency:"usd",livemode:false,status:"succeeded",amount:10000,amount_received:10000}),listRefunds:async()=>({has_more:false,data:[{id:"re_fixture",payment_intent:"pi_fixture",currency:"usd",amount:3500,status:"succeeded",created:1790880000}]})});
function setup(saved=[],refunds=[{id:"ref_fixture",amount_cents:"35"}]){native={id:"order_fixture",customer_id:"cus_fixture",created_at:"2026-09-01T09:00:00.000Z",metadata:signedMetadata(),fulfillments:[{canceled_at:null,delivered_at:"2026-09-20T08:00:00.000Z",items:[{line_item_id:"ordli_fixture"}]}],status:"completed",currency_code:"usd",summary:{pending_difference:0},items:[{id:"ordli_fixture",title:"Gear",variant_title:"M",detail:{delivered_quantity:new BigNumber(2),return_requested_quantity:0,return_received_quantity:0,written_off_quantity:0}}]};let writes=0;let sqls=[];const nativeReturns=[],exchanges=[],graphs=[];
 const db={transaction:async(callback)=>callback(db),raw:async(sql,values=[])=>{sqls.push(sql);if(sql.startsWith("select cart_id from commerce.order_cart"))return {rows:[{cart_id:"cart_fixture"}]};if(sql.startsWith("select id,metadata from commerce.store"))return {rows:[{id:"store_fixture",metadata:policyMetadata()}]};if(sql.includes("pg_advisory"))return {rows:[]};if(sql.startsWith("select o.id"))return {rows:[{id:"order_fixture",currency_code:"usd",payments:[{id:"pay_fixture",provider_id:"pp_stripe_stripe",currency_code:"usd",amount_cents:"100",intent_id:"pi_fixture",livemode:false,canceled:false,captures:[{id:"cap_fixture",amount_cents:"100"}],refunds}]}]};if(sql.startsWith("select p.id"))return {rows:[{id:"pay_fixture"}]};if(sql.startsWith("select state,observed_at"))return {rows:[]};if(sql.startsWith("insert into commerce.snowforce_refund"))return {rows:[{order_id:"order_fixture"}]};if(sql.includes("provider_identity"))return {rows:[{entity_id:member}]};if(sql.startsWith("insert into commerce.snowforce_after_sales")){writes++;const added={...row(),description:values[6],items:JSON.parse(values[7])};saved.push(added);return {rows:[added]};}if(sql.startsWith("update")){writes++;const changes=sql.includes("status='cancelled'")?{status:"cancelled"}:sql.includes("status='processing'")?{status:"processing",native_id:values[0]}:sql.includes("status='completed'")?{status:"completed",customer_message:values[0]}:sql.includes("status=?")?{status:values[0],customer_message:values[1],internal_note:values[2],reviewed_by:values[3]}:{return_carrier:values[0],return_tracking_number:values[1]};const changed={...saved[0],...changes,version:saved[0].version+1};saved[0]=changed;return {rows:[changed]};}if(sql.includes("count(*)"))return {rows:[{count:String(saved.length)}]};if(sql.includes("status in"))return {rows:saved.filter((entry)=>["pending","approved","processing"].includes(entry.status))};if(sql.includes("where id=?"))return {rows:saved.filter((entry)=>entry.id===values[0])};if(sql.includes("id<>?"))return {rows:saved.filter((entry)=>entry.id!==values[1])};return {rows:saved};}};
 const originalRaw=db.raw;db.raw=async(sql,values)=>{
   if(sql.startsWith('select id from commerce."order"'))return {rows:[{id:"order_fixture"}]};
   if(sql.includes('from commerce.snowforce_refund_allocations')||sql.startsWith('select f.allocation_id'))return {rows:[]};
   return originalRaw(sql,values);
 };
 const scope={resolve:(name)=>{if(name===ContainerRegistrationKeys.PG_CONNECTION)return db;if(name===ContainerRegistrationKeys.QUERY)return {graph:async(query)=>{graphs.push(query);return {data:query.entity==="return"?nativeReturns:exchanges};}};throw new Error("Unexpected native access");}};return {scope,saved,nativeReturns,exchanges,graphs,get writes(){return writes;},sqls};
}
test("return quantities use native delivered, pending, received and written-off counters exactly once",()=>{
 assert.equal(policy.returnableQuantity({delivered_quantity:new BigNumber(5),return_requested_quantity:"1",return_received_quantity:1,written_off_quantity:1,return_dismissed_quantity:1}),2);
 assert.equal(policy.returnableQuantity(null),0);for(const value of [-1,1.5,Infinity,"oops",{toNumber:()=>1}])assert.throws(()=>policy.returnableQuantity({delivered_quantity:value}));
});
test("requires unique bounded quantities and rejects undeclared operational fields",()=>{
 assert.equal(policy.afterSalesInput.safeParse(input()).success,true);
 for(const change of [{items:[...input().items,...input().items]},{items:[]},{items:[{id:"ordli_fixture",quantity:0}]},{price:1},{customer_id:"cus_other"},{description:"x"}])assert.equal(policy.afterSalesInput.safeParse({...input(),...change}).success,false);
});
test("anonymous Store and Admin requests and native guest-return bypass stop before data access",async()=>{
 for(const handler of [customerGET,customerPOST,adminGET,fundsPOST])await assert.rejects(()=>handler({auth_context:undefined},{json:()=>assert.fail("must not expose data")}));
 assert.throws(()=>useAfterSalesBoundary({}, {},()=>assert.fail("must not create return")));
});
test("verifies the owner, serializes a new request and replays the same idempotency key without extra writes",async()=>{
 const context=setup();const first=await service.submitAfterSales(context.scope,"order_fixture","cus_fixture",input());
 assert.equal(first.status,"pending");assert.equal(context.writes,1);assert.ok(context.sqls.some((sql)=>sql.includes("pg_advisory_xact_lock")));
 await service.submitAfterSales(context.scope,"order_fixture","cus_fixture",input());assert.equal(context.writes,1);
 await assert.rejects(()=>service.submitAfterSales(context.scope,"order_fixture","cus_foreign",input()));
 await assert.rejects(()=>service.submitAfterSales(context.scope,"order_fixture","cus_fixture",{...input(),description:"Different request"}));assert.equal(context.writes,1);
 assert.ok(!JSON.stringify(first).includes("private staff note"));for(const name of ["customer_id","member_id","reviewed_by","native_id"])assert.ok(!(name in first));
});
test("denies overlapping requests, foreign key replays and excessive or undelivered items",async()=>{
 for(const saved of [[{...row(),id:"33333333-3333-4333-8333-333333333333"}],[{...row(),customer_id:"cus_other"}]]){const c=setup(saved);await assert.rejects(()=>service.submitAfterSales(c.scope,"order_fixture","cus_fixture",input()));assert.equal(c.writes,0);}
 for(const items of [[{id:"ordli_foreign",quantity:1}],[{id:"ordli_fixture",quantity:3}]]){const c=setup();await assert.rejects(()=>service.submitAfterSales(c.scope,"order_fixture","cus_fixture",{...input(),items}));assert.equal(c.writes,0);}
 const c=setup();native.items[0].detail.delivered_quantity=0;await assert.rejects(()=>service.submitAfterSales(c.scope,"order_fixture","cus_fixture",input()));assert.equal(c.writes,0);
});
test("customers cancel only their pending version and cannot approve, refund or expose private notes",async()=>{
 const c=setup([row()]);await service.customerUpdateAfterSales(c.scope,"order_fixture",key,"cus_fixture",{command:"cancel",version:1});assert.equal(c.saved[0].status,"cancelled");
 for(const status of ["approved","processing","completed","rejected","cancelled"]){const cx=setup([{...row(),status}]);await assert.rejects(()=>service.customerUpdateAfterSales(cx.scope,"order_fixture",key,"cus_fixture",{command:"cancel",version:1}));assert.equal(cx.writes,0);}
 const foreign=setup([{...row(),member_id:"33333333-3333-4333-8333-333333333333"}]);await assert.rejects(()=>service.customerUpdateAfterSales(foreign.scope,"order_fixture",key,"cus_fixture",{command:"cancel",version:1}));
 assert.throws(()=>policy.assertCustomerUpdate(policy.afterSalesRow.parse({...row(),status:"approved"}),{command:"tracking",version:2,carrier:"UPS",trackingNumber:"fixture"}));
});
test("review rechecks quantities and version while never running native refund/inventory workflows",async()=>{
 const c=setup([row()]);await service.reviewAfterSales(c.scope,key,"user_fixture",{command:"review",version:1,decision:"approved",message:"Please use the return instructions."});assert.equal(c.writes,1);
 const stale=setup([row()]);await assert.rejects(()=>service.reviewAfterSales(stale.scope,key,"user_fixture",{command:"review",version:2,decision:"approved",message:"Instructions"}));assert.equal(stale.writes,0);
 const unavailable=setup([row()]);native.items[0].detail.return_requested_quantity=2;await assert.rejects(()=>service.reviewAfterSales(unavailable.scope,key,"user_fixture",{command:"review",version:1,decision:"approved",message:"Instructions"}));assert.equal(unavailable.writes,0);
});
test("native operation links require matching ownership, type and every item quantity",()=>{
 const r={id:"return_fixture",created_at:at,order_id:"order_fixture",status:"requested",canceled_at:null,exchange_id:null,claim_id:null,items:[{item_id:"ordli_fixture",quantity:1,received_quantity:0}]};
 assert.equal(service.validateNativeReturn(row(),r).id,"return_fixture");
 const {exchange_id:_exchange,claim_id:_claim,...unlinked}=r;
 assert.equal(service.validateNativeReturn(row(),unlinked).id,"return_fixture");
 for(const change of [{exchange:{id:"oexc_fixture"}},{claim:{id:"claim_fixture"}},{exchange_id:"oexc_fixture",exchange:{id:"oexc_other"}},{claim_id:"claim_fixture",claim:{id:"claim_other"}},{exchange:{}},{claim:{}}])assert.throws(()=>service.validateNativeReturn(row(),{...unlinked,...change}));
 for(const change of [{order_id:"order_foreign"},{created_at:"2026-09-01T00:00:00Z"},{canceled_at:at},{status:"canceled"},{claim_id:"claim_fixture"},{exchange_id:"oexc_fixture"},{items:[{...r.items[0],quantity:2}]}])assert.throws(()=>service.validateNativeReturn(row(),{...r,...change}));
 const received={...r,status:"received",items:[{...r.items[0],received_quantity:1}]};assert.doesNotThrow(()=>service.assertNativeCompletion(received,new BigNumber(0),[{quantity:1,delivered:1}]));
 for(const balance of [-10,10,null,undefined])assert.throws(()=>service.assertNativeCompletion(received,balance,[]));
 assert.throws(()=>service.assertNativeCompletion(r,0,[]));assert.throws(()=>service.assertNativeCompletion(received,0,[{quantity:1,delivered:0}]));
});
const operation=()=>({id:"return_fixture",display_id:1,created_at:at,order_id:"order_fixture",status:"requested",canceled_at:null,exchange_id:null,claim_id:null,items:[{item_id:"ordli_fixture",quantity:1,received_quantity:0}]});

test("staff completion binds a current receipt to individual completed refunds and locks order before case/payment",async()=>{
 const f=await completedRefundFixture(),request={...row(),id:f.reservation.case_id,order_id:f.reservation.order_id,
   customer_id:f.sale.source.customer_id,status:"processing",version:4,native_id:f.reservation.native_return_id,
   items:f.input.items.map(line=>({id:line.item_id,quantity:line.quantity}))};
 const c=setup([request]);native.id=request.order_id;native.customer_id=request.customer_id;native.items[0].id=request.items[0].id;
 c.nativeReturns.push({...operation(),id:request.native_id,order_id:request.order_id,status:"received",
   items:request.items.map(line=>({item_id:line.id,quantity:line.quantity,received_quantity:line.quantity}))});
 const db=c.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION),original=db.raw,observed=[];
 db.raw=async(sql,values)=>{
   observed.push(sql);
   if(sql.startsWith("select o.id"))return {rows:[{id:request.order_id,currency_code:"usd",payments:[{
     id:f.reservation.payment_id,provider_id:"pp_stripe_stripe",currency_code:"usd",amount_cents:f.native.payment_amount,
     intent_id:f.sale.source.intent_id,livemode:false,canceled:false,
     captures:f.native.captures.map(capture=>({id:capture.id,amount_cents:capture.amount})),refunds:[{id:f.native.id,amount_cents:f.native.amount}]}]}]};
   if(sql.includes("from commerce.snowforce_refund_allocations"))return {rows:[structuredClone(f.reservation)]};
   if(sql.startsWith("select f.native_refund_id")||sql.includes("from commerce.refund r"))return f.balanceDb.raw(sql,values);
   return original(sql,values);
 };
 const provider={livemode:false,retrieveIntent:async()=>f.intent,listRefunds:async()=>({has_more:false,data:[f.refund]})};
 const posts=f.moneyPosts.length;
 const result=await service.reviewAfterSales(c.scope,request.id,"user_fixture",{command:"complete",version:4,message:"Returned item refunded and tax reversed."},provider);
 assert.equal(result.status,"completed");assert.equal(result.version,5);assert.equal(c.writes,1);assert.equal(f.moneyPosts.length,posts);
 const orderLock=observed.findIndex(sql=>sql.startsWith('select id from commerce."order"'));
 const caseLock=observed.findIndex(sql=>sql.includes("snowforce_after_sales where id=? for update"));
 const paymentLock=observed.findIndex(sql=>sql.startsWith("select p.id"));
 assert.ok(orderLock>=0&&orderLock<caseLock&&caseLock<paymentLock);
});
test("customers read only their requests while approved tracking updates preserve ownership and version",async()=>{
 const c=setup([{...row(),status:"approved"}]);const result=await service.customerAfterSalesList(c.scope,"order_fixture","cus_fixture");assert.equal(result.eligibleItems[0].available,2);assert.ok(!JSON.stringify(result).includes("private staff note"));assert.ok(c.sqls.some((sql)=>sql.includes("customer_id=? and member_id=?")));
 await service.customerUpdateAfterSales(c.scope,"order_fixture",key,"cus_fixture",{command:"tracking",version:1,carrier:"UPS",trackingNumber:"fixture-tracking"});assert.equal(c.saved[0].return_tracking_number,"fixture-tracking");assert.equal(c.saved[0].version,2);
 const queue=await service.adminAfterSalesList(c.scope,"approved",0);assert.equal(queue.count,1);await assert.rejects(()=>service.adminAfterSalesList(c.scope,"forged",0));
});
test("customer purchase terms keep the signed historical version, show ordinary deadlines and never expose private receipts",async()=>{
 const c=setup([{...row(),status:"approved",reviewed_at:at}]);const db=c.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION),raw=db.raw;
 db.raw=async(sql,values)=>{
   if(sql.startsWith("select id,metadata from commerce.store")){
     const metadata=policyMetadata(),state=metadata[shopPolicy.shopPolicyMetadataKey];const later=structuredClone(state.publications[0]);later.version=2;later.published_at=later.effective_at="2026-09-10T08:00:00.000Z";later.content.terms.return_window_days=5;
     state.publications.push(later);state.revision=state.draft.version=state.published_version=2;
     c.sqls.push(sql);return {rows:[{id:"store_fixture",metadata}]};
   }
   return raw(sql,values);
 };
 const result=await service.customerAfterSalesList(c.scope,"order_fixture","cus_fixture");
 assert.equal(result.purchase.orderId,"order_fixture");assert.equal(result.purchase.policy.version,1);assert.equal(result.purchase.policy.content.terms.return_window_days,30);
 assert.equal(result.purchase.lines[0].latestDeadline,"2026-10-20");assert.equal(result.purchase.lines[0].title,"Gear");assert.equal(result.purchase.dispatches[0].dispatchBy,"2026-10-15");
 assert.equal(c.sqls.filter(sql=>sql.startsWith("select id,metadata from commerce.store")).length,1);assert.equal(c.writes,0);
 for(const value of ["private staff note","signature","save_receipts","customer_id","published_by"])assert.equal(JSON.stringify(result).includes(value),false);
 await assert.rejects(()=>service.customerAfterSalesList(c.scope,"order_fixture","cus_foreign"));
});
test("unverified policies and invalid approval chronology yield manual review without assumed return deadlines",async()=>{
 for(const edit of [()=>{native.metadata=null;},()=>{native.metadata.snowforce_policy_acceptance.signature="f".repeat(64);}]){
   const c=setup([{...row(),status:"approved",reviewed_at:at}]);edit();const value=await service.customerAfterSalesList(c.scope,"order_fixture","cus_fixture");
   assert.equal(value.purchase.policy,null);assert.equal(value.purchase.lines[0].status,"manual");assert.equal(value.purchase.lines[0].earliestDeadline,null);assert.deepEqual(value.purchase.dispatches,[]);assert.equal(c.writes,0);
 }
 for(const reviewedAt of [null,"2026-09-01T00:00:00.000Z","2099-01-01T00:00:00.000Z"]){const c=setup([{...row(),status:"approved",reviewed_at:reviewedAt}]);assert.deepEqual((await service.customerAfterSalesList(c.scope,"order_fixture","cus_fixture")).purchase.dispatches,[]);}
});
test("admin links a verified native case and cannot complete before receipt and payment settlement",async()=>{
 const c=setup([{...row(),status:"approved"}]);c.nativeReturns.push(operation());
 const detail=await service.adminAfterSalesDetail(c.scope,key);assert.equal(detail.items[0].title,"Gear");assert.equal(detail.candidates[0].label,"Return #1");
 await service.reviewAfterSales(c.scope,key,"user_fixture",{command:"link",version:1,nativeId:"return_fixture"});assert.equal(c.saved[0].status,"processing");
 await assert.rejects(()=>service.reviewAfterSales(c.scope,key,"user_fixture",{command:"complete",version:2,message:"Completed your request"},reader()));assert.equal(c.saved[0].status,"processing");
 c.nativeReturns[0]={...operation(),status:"received",items:[{...operation().items[0],received_quantity:1}]};native.summary.pending_difference=-50;
 await assert.rejects(()=>service.reviewAfterSales(c.scope,key,"user_fixture",{command:"complete",version:2,message:"Completed your request"},reader()));assert.equal(c.writes,1);
 native.summary.pending_difference=0;await assert.rejects(()=>service.reviewAfterSales(c.scope,key,"user_fixture",{command:"complete",version:2,message:"Your return has been received and settled."},reader()));assert.equal(c.saved[0].status,"processing");assert.equal(c.writes,1);
});
test("exchange links exclude foreign/cancelled/reused native cases and verify replacement delivery",async()=>{
 const c=setup([{...row(),kind:"exchange",status:"approved"}],[]);const noRefundReader={...reader(),listRefunds:async()=>({has_more:false,data:[]})};c.nativeReturns.push({...operation(),exchange_id:"oexc_fixture"});c.exchanges.push({id:"oexc_fixture",display_id:2,order_id:"order_fixture",return_id:"return_fixture",canceled_at:null,additional_items:[{item_id:"ordli_replacement",quantity:1}]});
 native.items.push({id:"ordli_replacement",title:"Replacement",variant_title:"L",detail:{delivered_quantity:0}});
 await service.reviewAfterSales(c.scope,key,"user_fixture",{command:"link",version:1,nativeId:"oexc_fixture"});c.nativeReturns[0]={...c.nativeReturns[0],status:"received",items:[{...operation().items[0],received_quantity:1}]};
 await assert.rejects(()=>service.reviewAfterSales(c.scope,key,"user_fixture",{command:"complete",version:2,message:"Exchange completed"},noRefundReader));native.items[1].detail.delivered_quantity=1;await service.reviewAfterSales(c.scope,key,"user_fixture",{command:"complete",version:2,message:"Exchange delivered and settled"},noRefundReader);assert.equal(c.saved[0].status,"completed");
 for(const change of [{order_id:"order_foreign"},{canceled_at:at}]){const cx=setup([{...row(),status:"approved"}]);cx.nativeReturns.push({...operation(),...change});const detail=await service.adminAfterSalesDetail(cx.scope,key);assert.equal(detail.candidates.length,0);}
 const reused=setup([{...row(),status:"approved"},{...row(),id:"33333333-3333-4333-8333-333333333333",native_id:"return_fixture",status:"completed"}]);reused.nativeReturns.push(operation());await assert.rejects(()=>service.reviewAfterSales(reused.scope,key,"user_fixture",{command:"link",version:1,nativeId:"return_fixture"}));assert.equal(reused.writes,0);
});
test("settled native balances and received returns cannot close pending or failed Stripe refunds",async()=>{
 for(const state of ["pending","requires_action","failed","canceled"]){
  const c=setup([{...row(),status:"processing",native_id:"return_fixture"}]);
  c.nativeReturns.push({...operation(),status:"received",items:[{...operation().items[0],received_quantity:1}]});
  const r={...reader(),listRefunds:async()=>({has_more:false,data:[{id:"re_fixture",payment_intent:"pi_fixture",currency:"usd",amount:3500,status:state,created:1790880000}]})};
  await assert.rejects(()=>service.reviewAfterSales(c.scope,key,"user_fixture",{command:"complete",version:1,message:"Return received and settled"},r));
  assert.equal(c.saved[0].status,"processing");assert.equal(c.writes,0);
 }
});

test("ordinary out-of-window approval requires a staff exception, records its reason and preserves customer privacy",async()=>{
 const late={...row(),created_at:"2026-10-22T08:00:00.000Z"};const c=setup([late]);
 const command={command:"review",version:1,decision:"approved",message:"We have reviewed your return."};
 const detail=await service.adminAfterSalesDetail(c.scope,key);assert.equal(detail.timing.requiresException,true);assert.equal(detail.timing.lines[0].latestDeadline,"2026-10-20");
 for(const change of [{},{policyException:true},{policyException:true,internalNote:"four"}])await assert.rejects(()=>service.reviewAfterSales(c.scope,key,"user_fixture",{...command,...change}));
 assert.equal(c.writes,0);
 await service.reviewAfterSales(c.scope,key,"user_fixture",{...command,policyException:true,internalNote:"Courtesy exception after checking delivery."});
 assert.equal(c.saved[0].status,"approved");assert.match(c.saved[0].internal_note,/Purchase-policy exception/);assert.match(c.saved[0].internal_note,/Courtesy/);
 assert.ok(!JSON.stringify(policy.customerAfterSales(policy.afterSalesRow.parse(c.saved[0]))).includes("Courtesy"));
});
test("quality approvals and decline decisions do not inherit the ordinary expiry restriction",async()=>{
 for(const reason of ["quality","incorrect"]){const c=setup([{...row(),reason,created_at:"2026-10-22T08:00:00.000Z"}]);await service.reviewAfterSales(c.scope,key,"user_fixture",{command:"review",version:1,decision:"approved",message:"Please follow the return instructions."});assert.equal(c.saved[0].status,"approved");}
 const c=setup([{...row(),created_at:"2026-10-22T08:00:00.000Z"}]);await service.reviewAfterSales(c.scope,key,"user_fixture",{command:"review",version:1,decision:"rejected",message:"The ordinary window has ended."});assert.equal(c.saved[0].status,"rejected");
 assert.equal(policy.afterSalesInput.safeParse({...input(),policyException:true}).success,false);
});
test("policyless ordinary orders require explicit review, while approved dispatch dates come from original terms",async()=>{
 const c=setup([row()]);native.metadata=null;await assert.rejects(()=>service.reviewAfterSales(c.scope,key,"user_fixture",{command:"review",version:1,decision:"approved",message:"Please return your gear."}));assert.equal(c.writes,0);
 const approved=setup([{...row(),status:"approved",reviewed_at:"2026-10-02T18:00:00.000Z"}]);const detail=await service.adminAfterSalesDetail(approved.scope,key);assert.equal(detail.timing.dispatchBy,"2026-10-16");assert.equal(detail.timing.approvedDispatchDays,14);
});
