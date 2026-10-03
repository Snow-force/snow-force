import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import {fixture,read} from "./tax-source.mjs";
import {quoteCalculation} from "./tax-quote.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const {decorateCartTotals}=require("@medusajs/utils");
const {checkoutCartSchema}=require("../../src/lib/checkout-policy.ts");
const money=require("../../src/lib/tax-quote-money.ts"),ledger=require("../../src/lib/tax-quote-ledger.ts"),consent=require("../../src/lib/policy-consent.ts"),policy=require("../../src/lib/shop-policy.ts");
const md5=value=>createHash("md5").update(JSON.stringify(value)).digest("hex");

export async function paymentAmountFixture(ids={}){
  const f=fixture();
  for(const key of ["id","customer_id"])if(ids[key])f.cart[key]=ids[key];
  if(ids.item_id)f.cart.items[0].id=ids.item_id;if(ids.shipping_id)f.cart.shipping_methods[0].id=ids.shipping_id;
  const base=f.scope,source=await read(f,{actor_type:"customer",actor_id:f.cart.customer_id}),input=source.input,calculation=quoteCalculation(input);
  const breakdown=(amount,basis)=>({amount,taxable_amount:basis,taxability_reason:"standard_rated",jurisdiction:{country:"US",state:"CA",level:"state",display_name:"Isolated fixture"},sourcing:"destination",tax_rate_details:{display_name:"Sales tax",percentage_decimal:"10",tax_type:"sales_tax"}});
  calculation.line_items.data[0].amount_tax=154;calculation.line_items.data[0].tax_breakdown=[breakdown(154,9999)];
  calculation.shipping_cost.amount_tax=87;calculation.tax_amount_exclusive=241;calculation.amount_total+=241;
  calculation.tax_breakdown=[{amount:241,taxable_amount:10994,taxability_reason:"standard_rated",inclusive:false,tax_rate_details:{country:"US",state:"CA",percentage_decimal:"10",rate_type:"percentage",tax_type:"sales_tax",flat_amount:null}}];
  f.cart.items[0].tax_lines=[{rate:Number(Math.fround(15400/9999).toPrecision(6))}];
  f.cart.shipping_methods[0].tax_lines=[{rate:Number(Math.fround(8700/995).toPrecision(6))}];
  f.cart=JSON.parse(JSON.stringify(decorateCartTotals(f.cart)));
  const quote=money.normalizeStripeTaxQuote(input,calculation,input.tax_date),receipt=ledger.sealTaxQuoteReceipt("123e4567-e89b-42d3-a456-426614174022",quote,source.setup.fingerprint,checkoutCartSchema.parse(f.cart),f.cart);
  f.cart.metadata.snowforce_tax_quote=receipt;
  f.cart.metadata[consent.policyAcceptanceKey]=consent.sealPolicyAcceptance(checkoutCartSchema.parse(f.cart),policy.publishedShopPolicy(f.metadata,f.date),f.date);
  f.cart.payment_collection={id:ids.collection_id??"paycol_fixture",amount:f.cart.total,currency_code:"usd",payment_sessions:[]};
  f.rawAmount={value:String(f.cart.total),precision:20};f.row=null;f.depth=0;f.writes=[];f.onWrite=null;f.noUpdate=false;f.proofPatch=null;f.guardPatch={};f.bound=null;f.retired=false;
  f.proof={id:receipt.quote_id,input,calculation,snapshot:quote,setup_fingerprint:source.setup.fingerprint,receipt,database_now:input.tax_date,operation_state:"ready",payment_session_id:null,bound_at:null,payment:null};
  const currentCart=()=>({...f.cart,payment_collection:f.retired?null:{...f.cart.payment_collection,payment_sessions:f.row?[{id:f.row.id,provider_id:f.row.provider_id,currency_code:f.row.currency_code,amount:f.row.amount,status:f.row.status,data:f.row.data}]:[]}});
  const raw=async(sql,values=[])=>{
    if(sql.includes("from commerce.snowforce_tax_quotes q join"))return {rows:[{...structuredClone(f.proof),...(f.proofPatch??{}),payment_session_id:f.bound,bound_at:f.bound?input.tax_date:null,payment:f.row?{...f.row,collection_id:f.cart.payment_collection.id,created_at:input.tax_date}:null}]};
    if(sql.startsWith("set local")||sql.endsWith("for update")){assert.equal(f.depth,1);return {rows:[]};}
    if(sql.startsWith("select pc.id,l.id as link_id"))return {rows:[{id:f.cart.payment_collection.id,link_id:"link_fixture",customer_id:f.cart.customer_id,currency_code:"usd",amount:String(f.cart.payment_collection.amount),raw_amount:f.rawAmount,raw_fingerprint:md5(f.rawAmount),receipt_signature:receipt.signature,status:"not_paid",completed:false,authorized_amount:0,captured_amount:0,refunded_amount:0,session_count:f.row?1:0,collection_count:1,has_order:false,has_payment:false,has_authorization:false,...f.guardPatch}]};
    if(sql.startsWith("update commerce.payment_collection pc set amount")){
      assert.equal(f.depth,1);assert.equal(values[0],11235);assert.equal(values[2],f.cart.payment_collection.id);assert.equal(values[4],md5(f.rawAmount));
      if(f.noUpdate)return {rows:[]};f.cart.payment_collection.amount=values[0]/100;f.rawAmount=JSON.parse(values[1]);f.writes.push(sql);f.onWrite?.();return {rows:[{id:f.cart.payment_collection.id}]};
    }
    if(sql.startsWith("select c.id,c.customer_id"))return {rows:[{id:f.cart.id,customer_id:f.cart.customer_id,currency_code:"usd",completed:false,updated_at:f.date,has_order:false,has_payment:false,has_authorization:false,collections:f.retired?[]:[{id:f.cart.payment_collection.id,link_id:"link_fixture",currency_code:"usd",amount_cents:String(f.cart.payment_collection.amount),status:"not_paid",completed:false,authorized_cents:"0",captured_cents:"0",refunded_cents:"0",sessions:f.row?[{id:f.row.id,provider_id:f.row.provider_id,currency_code:f.row.currency_code,amount_cents:String(f.row.amount),status:f.row.status,authorized:false,intent_id:f.row.data.id??null,livemode:f.row.data.livemode??null,data_session_id:f.row.data.metadata?.session_id??null,data_amount_cents:f.row.data.amount??null,data_fingerprint:md5(f.row.data),raw_amount_fingerprint:md5(f.row.raw_amount),updated_at:f.row.updated_at}]:[]}]}]};
    if(sql.startsWith("insert into commerce.payment_session")){assert.equal(f.depth,1);assert.equal(f.row,null);f.row={id:values[0],provider_id:values[2],currency_code:"usd",amount:values[3]/100,raw_amount:JSON.parse(values[4]),status:"pending",data:JSON.parse(values[5]),context:JSON.parse(values[6]),metadata:JSON.parse(values[7]),created_at:f.date,database_now:f.date,updated_at:f.date};f.writes.push(sql);return {rows:[]};}
    if(sql.startsWith("select id,amount"))return {rows:f.row?[structuredClone(f.row)]:[]};
    if(sql.startsWith("update commerce.snowforce_tax_quote_applications")){assert.equal(f.depth,1);f.bound=values[0];return {rows:[{quote_id:receipt.quote_id}]};}
    if(sql.startsWith("update commerce.payment_session set data")){assert.equal(f.depth,1);assert.equal(values[6],11235);f.row.data=JSON.parse(values[0]);f.row.status=values[1];f.writes.push(sql);return {rows:[{id:f.row.id}]};}
    if(sql.startsWith("update commerce.payment_session s set status")){assert.equal(f.depth,1);f.row.status="canceled";f.writes.push(sql);return {rows:[{id:f.row.id}]};}
    if(sql.startsWith("update commerce.cart_payment_collection l set deleted_at")){assert.equal(f.depth,1);f.retired=true;f.writes.push(sql);return {rows:[{id:"link_fixture"}]};}
    return base.resolve("__pg_connection__").raw(sql,values);
  };
  f.db={raw,transaction:async operation=>{const before=structuredClone([f.cart,f.rawAmount,f.row,f.bound,f.retired]),count=f.writes.length;f.depth++;try{return await operation(f.db);}catch(error){[f.cart,f.rawAmount,f.row,f.bound,f.retired]=before;f.writes.length=count;throw error;}finally{f.depth--;}}};
  const graph=base.resolve("query").graph;
  f.scope={resolve:key=>key==="__pg_connection__"?f.db:key==="query"?{graph:async request=>request.entity==="cart"?{data:[structuredClone(currentCart())]}:request.entity==="region"?{data:[{id:f.cart.region_id,...f.region,payment_providers:[{id:"pp_stripe_stripe",is_enabled:true}]}]}:graph(request)}:base.resolve(key)};
  f.current=()=>checkoutCartSchema.parse(currentCart());f.quote=quote;f.receipt=receipt;
  f.writer={livemode:false,namespace:"f".repeat(64),calls:[],createIntent:async(parameters,key)=>{assert.equal(f.depth,0);f.writer.calls.push({parameters,key});return {id:"pi_fixture",amount:parameters.amount,currency:"usd",livemode:false,status:"requires_payment_method",amount_received:0,amount_capturable:0,metadata:parameters.metadata,client_secret:"pi_fixture_secret_fixture"};},retrieveIntent:async id=>{assert.equal(f.depth,0);return {id,amount:11235,currency:"usd",livemode:false,status:"requires_payment_method",amount_received:0,amount_capturable:0,metadata:{session_id:f.row.id},client_secret:"pi_fixture_secret_fixture"};}};
  return f;
}
