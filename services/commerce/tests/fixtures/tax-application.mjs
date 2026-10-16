import {createRequire} from "node:module";
import assert from "node:assert/strict";
import {auth} from "./tax-source.mjs";
import {creationFixture} from "./tax-creation.mjs";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const {decorateCartTotals}=require("@medusajs/utils");
const {createCartTaxQuote}=require("../../src/lib/tax-quote-creation.ts");
const {applyCartTaxQuote}=require("../../src/lib/tax-quote-application.ts");
const {readStripeTaxSetup}=require("../../src/lib/tax-setup.ts");
export const withEnabled=async(callback)=>{const old=process.env.COMMERCE_TAX_POLICY_CONFIRMED;try{process.env.COMMERCE_TAX_POLICY_CONFIRMED="true";return await callback();}finally{if(old===undefined)delete process.env.COMMERCE_TAX_POLICY_CONFIRMED;else process.env.COMMERCE_TAX_POLICY_CONFIRMED=old;}};
export async function applicationFixture({state="CA",fee=0,itemTax=154,shippingTax=87}={}){
  const f=creationFixture(),base=f.scope,db=base.resolve("__pg_connection__");
  f.cart.credit_lines=[];f.cart.shipping_address.province=state.toLowerCase();
  if(fee){
    const registrations=f.setup.registrations;f.setup.registrations=async(...args)=>{const result=structuredClone(await registrations(...args));result.data.push({...result.data[0],id:"taxreg_state",country_options:{us:{state,type:"state_sales_tax"}}},{...result.data[0],id:"taxreg_fee",country_options:{us:{state,type:"state_retail_delivery_fee"}}});return result;};
    const metadata=f.metadata.snowforce_tax_configuration,publication=metadata.publications.at(-1);
    publication.setup_fingerprint=(await readStripeTaxSetup(f.setup)).fingerprint;
  }
  const create=f.writer.createCalculation,list=f.writer.listLineItems;
  const calculated=raw=>{
    const amount=itemTax+shippingTax+fee,li=raw.line_items.data[0];li.amount_tax=itemTax;
    li.tax_breakdown=[{amount:itemTax,taxable_amount:li.amount,taxability_reason:"standard_rated",jurisdiction:{country:"US",state,level:"state",display_name:"Isolated fixture"},sourcing:"destination",tax_rate_details:{display_name:"Sales tax",percentage_decimal:"10",tax_type:"sales_tax"}}];
    const part=(value,basis)=>({amount:value,taxable_amount:basis,inclusive:false,taxability_reason:"standard_rated",tax_rate_details:{country:"US",state,percentage_decimal:"10",rate_type:"percentage",tax_type:"sales_tax",flat_amount:null}});
    raw.tax_breakdown=[part(itemTax,li.amount),part(shippingTax,raw.shipping_cost.amount)];
    if(fee)raw.tax_breakdown.push({amount:fee,taxable_amount:0,inclusive:false,taxability_reason:"standard_rated",tax_rate_details:{country:"US",state,percentage_decimal:"0",rate_type:"flat_amount",tax_type:"retail_delivery_fee",flat_amount:{amount:fee,currency:"usd"}}});
    raw.amount_total+=amount;raw.tax_amount_exclusive=amount;raw.shipping_cost.amount_tax=shippingTax+fee;return raw;
  };
  f.writer.createCalculation=async(...args)=>calculated(await create(...args));
  f.writer.listLineItems=async(...args)=>{
    const result=await list(...args);return {...result,data:result.data.map(line=>({...line,amount_tax:itemTax,tax_breakdown:[{amount:itemTax,taxable_amount:line.amount,taxability_reason:"standard_rated",jurisdiction:{country:"US",state,level:"state",display_name:"Isolated fixture"},sourcing:"destination",tax_rate_details:{display_name:"Sales tax",percentage_decimal:"10",tax_type:"sales_tax"}}]}))};
  };
  const prepared=await withEnabled(()=>createCartTaxQuote(f.scope,auth,f.cart.id));
  Object.assign(f,{prepared,applications:new Map(),writes:[],retiredTaxes:[],retiredFees:[],retiredCollections:[],failWrite:0,emptyWrite:0,onWrite:null,guard:null,clockShift:0});
  const recalculate=()=>{f.cart=JSON.parse(JSON.stringify(decorateCartTotals(f.cart)));};
  const raw=async(sql,values=[])=>{
    if(sql.startsWith("select id from commerce.cart where"))return db.raw(sql,values);
    if(sql.startsWith("select id,metadata from commerce.store"))return {rows:[{id:"store_fixture",metadata:structuredClone(f.metadata)}]};
    if(sql.startsWith("select id, metadata, clock_timestamp()"))return {rows:[{id:"store_fixture",metadata:structuredClone(f.metadata),database_now:f.date}]};
    if(sql.startsWith("select id,customer_id,currency_code,region_id"))return {rows:[{id:f.cart.id,customer_id:f.cart.customer_id,currency_code:f.cart.currency_code,region_id:f.cart.region_id,completed_at:f.cart.completed_at,shipping_address_id:"caaddr_fixture"}]};
    if(sql.startsWith("select\n    exists"))return {rows:[{has_order:false,has_session:false,has_payment:false,has_collection_funds:false,collection_count:f.cart.payment_collection?1:0,...f.guard}]};
    if(sql.startsWith("select to_jsonb(c)"))return values.length===2?db.raw(sql,values):{rows:[{cart:structuredClone(f.cart)}]};
    if(sql.startsWith("select quote_id from commerce.snowforce_tax_quote_applications"))return {rows:f.applications.has(values[0])?[{quote_id:values[0]}]:[]};
    if(sql.startsWith("select id from commerce.snowforce_tax_operations"))return {rows:[...f.operations.values()].filter(row=>row.state==="pending").map(row=>({id:row.id}))};
    if(sql.includes("from commerce.snowforce_tax_quotes q join")){
      const quoteId=f.cart.metadata.snowforce_tax_quote?.quote_id,row=f.results.get(quoteId),operation=f.operations.get(quoteId),receipt=f.applications.get(quoteId);
      return {rows:row&&receipt?[{id:quoteId,...structuredClone(row),receipt,setup_fingerprint:operation.setup_fingerprint,operation_state:operation.state,database_now:Math.floor(new Date(f.date).getTime()/1000)+f.clockShift,payment_session_id:null,bound_at:null,payment:null}]:[]};
    }
    if(sql.startsWith("select floor(extract"))return {rows:[{database_now:Math.floor(new Date(f.date).getTime()/1000)+f.clockShift}]};
    if(sql.startsWith("set local")||sql.startsWith("lock table")||sql.includes("for update")&&!sql.startsWith("select id,input,"))return {rows:[]};
    if(/^(update commerce.cart|insert into commerce.cart|insert into commerce.snowforce_tax_quote_applications|delete from commerce.cart_payment_collection)/.test(sql)){
      assert.equal(f.depth,1);f.writes.push({sql,values});f.onWrite?.(f.writes.length);
      if(f.failWrite===f.writes.length)throw new Error("private-atomic-write-detail");if(f.emptyWrite===f.writes.length)return {rows:[]};
      if(sql.startsWith("update commerce.cart_line_item_tax_line")){const rows=[];for(const item of f.cart.items){rows.push(...item.tax_lines);f.retiredTaxes.push(...item.tax_lines);item.tax_lines=[];}recalculate();return {rows:sql.includes("returning id")?rows:[]};}
      if(sql.startsWith("update commerce.cart_shipping_method_tax_line")){const rows=[];for(const method of f.cart.shipping_methods){rows.push(...method.tax_lines);f.retiredTaxes.push(...method.tax_lines);method.tax_lines=[];}recalculate();return {rows:sql.includes("returning id")?rows:[]};}
      if(sql.startsWith("insert into commerce.cart_line_item_tax_line")){const [id,itemId,code,rate,description,metadata]=values;const item=f.cart.items.find(row=>row.id===itemId);item.tax_lines.push({id,code,rate,description,provider_id:"snowforce_stripe_tax",metadata:JSON.parse(metadata)});recalculate();return {rows:[]};}
      if(sql.startsWith("insert into commerce.cart_shipping_method_tax_line")){const [id,methodId,code,rate,description,metadata]=values;f.cart.shipping_methods.find(row=>row.id===methodId).tax_lines.push({id,code,rate,description,provider_id:"snowforce_stripe_tax",metadata:JSON.parse(metadata)});recalculate();return {rows:[]};}
      if(sql.startsWith("insert into commerce.cart_line_item(")){const [id,cartId,title,price,rawPrice,metadata]=values;assert.equal(cartId,f.cart.id);f.cart.items.push({id,variant_id:null,product_id:null,title,product_title:null,product_handle:null,variant_title:null,thumbnail:null,quantity:1,unit_price:price,raw_unit_price:JSON.parse(rawPrice),is_tax_inclusive:false,is_custom_price:true,is_discountable:false,requires_shipping:false,metadata:JSON.parse(metadata),tax_lines:[],adjustments:[]});recalculate();return {rows:[]};}
      if(sql.startsWith("update commerce.cart_line_item set deleted_at")){const item=f.cart.items.find(item=>item.id===values[0]);assert.ok(item);f.retiredFees.push(item);f.cart.items=f.cart.items.filter(item=>item.id!==values[0]);recalculate();return {rows:[{id:values[0]}]};}
      if(sql.startsWith("delete from commerce.cart_payment_collection")){f.retiredCollections.push(structuredClone(f.cart.payment_collection));f.cart.payment_collection=null;return {rows:[{id:"link_fixture"}]};}
      if(sql.startsWith("insert into commerce.snowforce_tax_quote_applications")){f.applications.set(values[0],JSON.parse(values[1]));return {rows:[]};}
      if(sql.startsWith("update commerce.cart set metadata=coalesce")){delete f.cart.metadata[values[0]];delete f.cart.metadata[values[1]];return {rows:[{id:f.cart.id}]};}
      assert.ok(sql.startsWith("update commerce.cart set metadata=jsonb_set"));f.cart.metadata={...f.cart.metadata,snowforce_tax_quote:JSON.parse(values[0])};return {rows:[{id:f.cart.id}]};
    }
    return db.raw(sql,values);
  };
  const routedDb={raw,transaction:async action=>{
    const before=[structuredClone(f.cart),structuredClone(f.applications),structuredClone(f.retiredTaxes),structuredClone(f.retiredCollections),structuredClone(f.retiredFees)];
    try{return await db.transaction(()=>action({raw}));}
    catch(error){[f.cart,f.applications,f.retiredTaxes,f.retiredCollections,f.retiredFees]=before;throw error;}
  }};
  f.scope={resolve:(key,options)=>key==="__pg_connection__"?routedDb:base.resolve(key,options)};
  f.apply=(actor=auth,quoteId=prepared.quote_id,signals=[])=>withEnabled(()=>applyCartTaxQuote(f.scope,actor,f.cart.id,quoteId,signals));
  return f;
}
