import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { quoteCalculation, quoteInput, attachTaxQuote, taxNativeCart } from "./tax-quote.mjs";
const require=createRequire(import.meta.url); require("ts-node/register/transpile-only");
const contract=require("../../src/lib/tax-sale-contract.ts");
process.env.JWT_SECRET="fixture-tax-sale-signing-secret-at-least-32-characters";
export function saleFixture(){
  const now=Math.floor(Date.now()/1000),cart={id:"cart_sale",customer_id:"cus_sale",currency_code:"usd",region_id:"reg_fixture",email:"fixture@example.test",completed_at:null,total:109.95,subtotal:100,tax_total:0,shipping_total:9.95,discount_total:0,item_total:100,item_tax_total:0,
    shipping_address:{first_name:"Fixture",last_name:"Rider",address_1:"1 Test Street",address_2:"",city:"Fixture city",province:"ca",postal_code:"92614",country_code:"us",phone:"5551234567"},shipping_methods:[{id:"casm_sale",shipping_option_id:"so_fixture",name:"US standard",amount:9.95}],
    items:[{id:"cali_sale",variant_id:"variant_fixture",product_handle:"fixture",product_title:"Fixture gear",title:"Fixture gear",variant_title:"M",thumbnail:null,quantity:1,unit_price:100,total:100}],
    payment_collection:{id:"paycol_sale",currency_code:"usd",amount:109.95,payment_sessions:[{id:"payses_sale",provider_id:"pp_stripe_stripe",currency_code:"usd",amount:109.95,status:"authorized",data:{id:"pi_sale"}}]},metadata:null};
  const proof=attachTaxQuote(cart,now);cart.completed_at=new Date((now+1)*1000).toISOString();
  const source={schema_version:1,order_id:"order_sale",cart_id:cart.id,customer_id:cart.customer_id,quote_id:proof.id,payment_id:"pay_sale",session_id:"payses_sale",capture_id:"cap_sale",intent_id:"pi_sale",captured_at:now+2,receipt:proof.receipt,input:proof.input,calculation:proof.calculation};
  const native={order_id:source.order_id,customer_id:cart.customer_id,currency_code:"usd",order_receipt:proof.receipt,cart_id:cart.id,session_id:source.session_id,payment_id:source.payment_id,amount:"109.95",raw_amount:{value:"109.95"},provider_id:"pp_stripe_stripe",payment_currency:"usd",data:{id:source.intent_id,currency:"usd",livemode:false,metadata:{session_id:source.session_id}},captures:[{id:source.capture_id,amount:"109.95",raw_amount:{value:"109.95"},created_at:source.captured_at}],payment_count:"1",order_cart_count:"1",cart_order_count:"1",collection_order_count:"1"};
  return {source,cart,proof,native,nativeCart:taxNativeCart(cart)};
}
export function saleDatabase(source= saleFixture().source){
  const state={now:(source.captured_at+2)*1000,task:null,sales:[],writes:0,fail:null,locked:false};
  const clone=structuredClone;
  const row=()=>({...clone(state.task),database_now:state.now});
  const db={transaction:async action=>{const saved=clone(state);try{return await action(db)}catch(error){Object.assign(state,saved);throw error}},raw:async(sql,v=[])=>{
    if(state.fail&&sql.includes(state.fail))throw new Error("Injected SQL failure");
    if(sql.startsWith('select id from commerce."order"'))return {rows:[{id:source.order_id}]};
    if(sql.startsWith("select id,source,")){
      if(!state.task)return {rows:[]};
      if(sql.includes("where order_id"))return {rows:[row()]};
      if(sql.includes("state<>'ready'"))return {rows:state.task.state!=="ready"&&(!state.task.lease_until||state.task.lease_until<=state.now)?[row()]:[]};
      if(sql.includes("skip locked"))return {rows:!state.locked&&((['queued','retry'].includes(state.task.state)&&state.task.next_attempt_at<=state.now)||(state.task.state==='running'&&state.task.lease_until<=state.now))?[row()]:[]};
      if(sql.includes("claim_token=?"))return {rows:state.task.id===v[0]&&state.task.state==='running'&&state.task.claim_token===v[1]&&state.task.lease_until>state.now?[row()]:[]};
      assert.fail(sql);
    }
    if(sql.startsWith("insert into commerce.snowforce_tax_sale_tasks")){
      state.writes++;state.task={id:v[0],order_id:v[1],quote_id:v[2],source:JSON.parse(v[8]),source_fingerprint:v[9],request:JSON.parse(v[10]),request_fingerprint:v[11],state:'queued',remote_id:null,attempts:0,claim_token:null,lease_until:null,first_attempt_at:null,next_attempt_at:state.now};return {rows:[row()]};
    }
    if(sql.startsWith("update commerce.snowforce_tax_sale_tasks")){
      const task=state.task;if(!task)return {rows:[]};state.writes++;
      if(sql.includes("first_attempt_at=coalesce")){Object.assign(task,{state:'running',claim_token:v[0],lease_until:state.now+180000,first_attempt_at:task.first_attempt_at??state.now,attempts:task.attempts+1,error_code:null});return {rows:[row()]};}
      if(sql.includes("error_code='request_aged'")){Object.assign(task,{state:'reconcile_required',error_code:'request_aged',claim_token:null,lease_until:null});return {rows:[]};}
      const tokenIndex=sql.includes("remote_id=?")?2:sql.includes("state=?")?4:1,idIndex=tokenIndex-1;
      if(task.id!==v[idIndex]||task.state!=='running'||task.claim_token!==v[tokenIndex]||task.lease_until<=state.now)return {rows:[]};
      if(sql.includes("remote_id=?")){if(task.remote_id&&task.remote_id!==v[0])return {rows:[]};task.remote_id=v[0];}
      else if(sql.includes("state=?")){Object.assign(task,{state:v[0],error_code:v[1],next_attempt_at:state.now+v[2]*1000,claim_token:null,lease_until:null});}
      else if(sql.includes("state='ready'"))Object.assign(task,{state:'ready',error_code:null,claim_token:null,lease_until:null});
      else assert.fail(sql);
      return {rows:[{id:task.id}]};
    }
    if(sql.startsWith("insert into commerce.snowforce_tax_sales")){state.writes++;state.sales.push({task_id:v[0],transaction_id:v[5],snapshot:JSON.parse(v[6]),resolution:JSON.parse(v[7])});return {rows:[]};}
    if(sql.startsWith("select id,order_id,state"))return {rows:state.task?[{id:state.task.id,order_id:source.order_id,state:state.task.state,attempts:state.task.attempts,total_cents:source.receipt.total_cents,livemode:false,transaction_id:state.task.remote_id,created_at:new Date(state.now).toISOString(),updated_at:new Date(state.now).toISOString(),error_code:state.task.error_code??null}]:[]};
    if(sql.startsWith("select distinct o.id"))return {rows:[]};
    assert.fail(`Unexpected SQL: ${sql.slice(0,70)}`);
  }};
  return {state,db,scope:{resolve:key=>key==='__pg_connection__'?db:assert.fail(`Unexpected dependency ${key}`)}};
}
export function saleProvider(source, operationId){
  const {quote}=contract.checkedTaxSaleSource(source),request=contract.taxSaleRequest(source,operationId);
  const state={posts:[],gets:[],failCreate:null,failRead:false,pages:null};
  const transaction={id:"tax_sale",object:"tax.transaction",currency:"usd",livemode:false,type:"transaction",reversal:null,created:source.captured_at+1,posted_at:source.captured_at,tax_date:source.input.tax_date,reference:request.reference,metadata:request.metadata,customer_details:{address:structuredClone(source.input.shipping_address),address_source:'shipping',taxability_override:'none'},ship_from_details:{address:structuredClone(source.input.ship_from_address)},shipping_cost:{amount:quote.shipping.amount_cents,amount_tax:quote.shipping.sales_tax_cents+quote.amounts.government_fee_cents,tax_behavior:'exclusive',tax_code:quote.shipping.tax_code}};
  const lines=quote.lines.map((l,index)=>({id:`tax_li_sale${index}`,object:'tax.transaction_line_item',amount:l.net_cents,amount_tax:l.sales_tax_cents,quantity:l.quantity,reference:l.id,tax_code:l.tax_code,tax_behavior:'exclusive',livemode:false,type:'transaction',reversal:null}));
  const intent={id:source.intent_id,object:'payment_intent',currency:'usd',status:'succeeded',livemode:false,amount:quote.amounts.total_cents,amount_received:quote.amounts.total_cents,amount_capturable:0,metadata:{session_id:source.session_id}};
  const provider={livemode:false,account:async()=>({id:source.input.account_id}),intent:async()=>intent,create:async(r,key)=>{state.posts.push({request:structuredClone(r),key});if(state.failCreate)throw state.failCreate;return transaction},retrieve:async id=>{state.gets.push(id);if(state.failRead)throw new Error('Unknown network result');return transaction},lines:async(_id,cursor)=>state.pages?state.pages(cursor):({object:'list',has_more:false,data:lines})};
  return {provider,state,transaction,lines,intent};
}
