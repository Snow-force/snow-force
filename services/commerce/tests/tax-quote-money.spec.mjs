import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
const require=createRequire(import.meta.url);require("ts-node/register/transpile-only");
const { BigNumber,MathBN,decorateCartTotals,calculateTaxTotal }=require("@medusajs/framework/utils");
const money=require("../src/lib/tax-quote-money.ts"), contract=require("../src/lib/tax-quote-contract.ts");
const now=1790964000;
const address=(state="CA")=>({country:"US",state,city:"Fixture City",line1:"1 Test Street",line2:"",postal_code:"92614"});
function input(overrides={}) {
  return {cart_id:"cart_fixture",customer_id:"cus_fixture",cart_fingerprint:"a".repeat(64),configuration_revision:1,account_id:"acct_fixture",livemode:false,tax_date:now,
    policy_confirmed:true,california_permit_confirmed:true,obligations_reviewed:true,collecting_states:["CA"],collecting_retail_fee_states:[],shipping_address:address(),ship_from_address:address(),
    lines:["a","b"].map(id=>({id:`cali_${id}`,product_id:"prod_fixture",variant_id:"variant_fixture",title:"Fixture jacket",quantity:1,unit_price_cents:1499,discount_cents:0,tax_code:"txcd_99999999",classification_revision:1,classification_fingerprint:"b".repeat(64)})),
    shipping:{id:"casm_fixture",amount_cents:995,tax_code:"txcd_92010001"},...overrides};
}
const linePart=(amount,taxable,reason="standard_rated",state="CA",rate="10.25")=>({amount,taxable_amount:taxable,taxability_reason:reason,jurisdiction:{country:"US",state,level:"state",display_name:"Fixture state"},sourcing:"destination",tax_rate_details:{display_name:"Sales tax",percentage_decimal:rate,tax_type:"sales_tax"}});
const part=(amount,taxable,reason="standard_rated",state="CA",rate="10.25")=>({amount,taxable_amount:taxable,taxability_reason:reason,inclusive:false,tax_rate_details:{country:"US",state,percentage_decimal:rate,rate_type:"percentage",tax_type:"sales_tax",flat_amount:null}});
function calculation(source=input(),taxes=source.lines.map(()=>154),shippingTax=0,fee=0) {
  const state=source.shipping_address.state;
  const lines=source.lines.map((line,index)=>{const amount=line.unit_price_cents*line.quantity-line.discount_cents;return {id:`tax_li_${index}`,reference:line.id,amount,amount_tax:taxes[index],quantity:line.quantity,tax_code:line.tax_code,tax_behavior:"exclusive",livemode:false,tax_breakdown:[linePart(taxes[index],amount,"standard_rated",state)]};});
  const breakdown=[part(taxes.reduce((a,b)=>a+b,0),lines.reduce((a,line)=>a+line.amount,0),"standard_rated",state)];
  if(shippingTax)breakdown.push(part(shippingTax,source.shipping.amount_cents,"standard_rated",state,"8.75"));
  if(fee)breakdown.push({amount:fee,taxable_amount:0,inclusive:false,taxability_reason:"standard_rated",tax_rate_details:{country:"US",state,percentage_decimal:"0.0",rate_type:"flat_amount",tax_type:"retail_delivery_fee",flat_amount:{amount:fee,currency:"usd"}}});
  const totalTax=taxes.reduce((a,b)=>a+b,0)+shippingTax+fee;
  return {id:"taxcalc_fixture",object:"tax.calculation",currency:"usd",livemode:false,tax_date:source.tax_date,expires_at:now+86400,
    amount_total:lines.reduce((a,line)=>a+line.amount,0)+source.shipping.amount_cents+totalTax,tax_amount_exclusive:totalTax,tax_amount_inclusive:0,
    customer_details:{address:{...source.shipping_address,line2:null},address_source:"shipping",taxability_override:"none"},ship_from_details:{address:source.ship_from_address},
    line_items:{data:lines,has_more:false,total_count:lines.length},shipping_cost:{amount:source.shipping.amount_cents,amount_tax:shippingTax+fee,tax_code:source.shipping.tax_code,tax_behavior:"exclusive"},tax_breakdown:breakdown};
}
function native(quote) {
  const plan=money.nativeTaxQuotePlan(quote);
  return decorateCartTotals({currency_code:"usd",items:[...plan.items,...plan.fees.map((fee,index)=>({...fee,id:`cali_fee${index}`}))],shipping_methods:plan.shipping_methods});
}
const quote=(source=input(),taxes,shipTax,fee)=>money.normalizeStripeTaxQuote(source,calculation(source,taxes,shipTax,fee),now);
test("canonical request uses actual line amounts after discounts, quantities and complete shipping origins",()=>{
  const source=input();source.lines[0].quantity=2;source.lines[0].discount_cents=100;
  const request=money.buildStripeTaxQuoteRequest(source);
  assert.equal(request.line_items[0].amount,2898);assert.equal(request.line_items[0].quantity,2);assert.equal(request.line_items[0].tax_behavior,"exclusive");
  assert.equal(request.customer_details.address_source,"shipping");assert.deepEqual(request.ship_from_details.address,address());assert.equal(request.shipping_cost.amount,995);
  assert.deepEqual(request.expand,["line_items.data.tax_breakdown"]);assert.ok(!JSON.stringify(request).includes("configuration_revision"));
  assert.equal(money.taxQuoteBindingFingerprint(source),money.taxQuoteBindingFingerprint({...source,lines:[...source.lines].reverse(),tax_date:now+10}));
  for(const changed of [{account_id:"acct_other"},{livemode:true},{configuration_revision:2},{shipping_address:address("NY")},{lines:source.lines.map(line=>({...line,classification_revision:2}))}])assert.notEqual(money.taxQuoteBindingFingerprint(source),money.taxQuoteBindingFingerprint({...source,...changed}));
});
test("unconfirmed permits, unknown obligations, missing California registrations and excluded states fail before a request",()=>{
  for(const patch of [{policy_confirmed:false},{california_permit_confirmed:false},{obligations_reviewed:false},{collecting_states:[]},{collecting_states:["NY"]},{collecting_states:["CA","CA"]},{shipping_address:address("AK")},{shipping_address:address("HI")},{collecting_retail_fee_states:["CO"]}])assert.throws(()=>money.buildStripeTaxQuoteRequest(input(patch)));
  for(const state of contract.taxQuoteState.options){assert.doesNotThrow(()=>money.buildStripeTaxQuoteRequest(input({shipping_address:address(state)})));}
  assert.equal(contract.taxQuoteState.options.length,49);
});
test("quote input rejects duplicate or over-discounted lines and all supported amount overflows",()=>{
  const base=input();
  for(const lines of [[base.lines[0],base.lines[0]],[{...base.lines[0],discount_cents:1500}],[{...base.lines[0],unit_price_cents:99999999,quantity:2}]])assert.throws(()=>money.buildStripeTaxQuoteRequest({...base,lines}));
  assert.throws(()=>money.buildStripeTaxQuoteRequest({...base,shipping:{...base.shipping,amount_cents:99999999}}));
  assert.throws(()=>money.normalizeTaxDiscounts([{id:"a",quantity:1,unit_price:"10.00",adjustments:[{id:"shared",amount:1}]},{id:"b",quantity:1,unit_price:"10.00",adjustments:[{id:"shared",amount:1}]}]));
});
test("valid USD amounts use decimal arithmetic; fractional prices and unbounded amounts fail",()=>{
  assert.equal(money.exactTaxUsdCents("0.29"),29);assert.equal(money.exactTaxUsdCents(new BigNumber("999999.99")),99999999);
  assert.equal(money.nativeTaxUsdCents(new BigNumber("1.5400000000000000421")),154);
  for(const value of ["1.005",NaN,Infinity,true,null,-1,"1000000.00"])assert.throws(()=>money.exactTaxUsdCents(value));
  for(const value of ["1.536475","1.540001","1.53999"])assert.throws(()=>money.nativeTaxUsdCents(value));
});

test("the exact end of the private 15-minute quote window cannot return a usable new quote",()=>{
  const source=input(),calc=calculation(source);
  assert.doesNotThrow(()=>money.normalizeStripeTaxQuote(source,calc,now+899));
  assert.throws(()=>money.normalizeStripeTaxQuote(source,calc,now+900));
});
test("percentage discount cents are conserved across line and promotion allocations with stable tie ordering",()=>{
  const rows=[{id:"b",amount:"2.2485"},{id:"a",amount:"2.2485"}];
  assert.deepEqual(money.allocateRoundedTaxDiscounts(rows),[{id:"b",cents:225},{id:"a",cents:225}]);
  const tie=[{id:"b",amount:"0.005"},{id:"a",amount:"0.005"}];assert.deepEqual(money.allocateRoundedTaxDiscounts(tie),[{id:"b",cents:0},{id:"a",cents:1}]);
  const normalized=money.normalizeTaxDiscounts([{id:"cali_a",quantity:1,unit_price:"14.99",adjustments:[{id:"adj_a",amount:"1.12425"},{id:"adj_b",amount:"1.12425"}]},{id:"cali_b",quantity:1,unit_price:"14.99",adjustments:[{id:"adj_c",amount:"2.2485"}]}]);
  assert.deepEqual(normalized.map(line=>line.net_cents),[1274,1274]);assert.equal(normalized[0].adjustments.reduce((a,row)=>a+row.amount_cents,0),225);assert.deepEqual(normalized[0].adjustments.map(row=>row.amount),["1.13","1.12"]);
  for(const rows of [[{id:"a",amount:1},{id:"a",amount:2}],[{id:"",amount:1}],[{id:"a",amount:-1}]])assert.throws(()=>money.allocateRoundedTaxDiscounts(rows));
  assert.throws(()=>money.allocateRoundedTaxDiscounts([{id:"a",amount:1}],101));assert.throws(()=>money.allocateRoundedTaxDiscounts([{id:"a",amount:1}],99));
  assert.throws(()=>money.normalizeTaxDiscounts([{id:"cali_a",quantity:1,unit_price:"1.00",adjustments:[{id:"adj_a",amount:"1.001"}]}]));
});
test("Stripe's two 154-cent lines survive native full cart totals without the 307-cent aggregate error",()=>{
  const raw=calculateTaxTotal({taxableAmount:"14.99",taxLines:[{rate:10.25}]});assert.equal(MathBN.mult(raw,200).integerValue(4).toNumber(),307);
  const result=quote();assert.equal(result.amounts.sales_tax_cents,308);assert.equal(result.amounts.total_cents,4301);
  assert.equal(result.lines[0].breakdown[0].tax_rate_details.percentage_decimal,"10.25");
  const mapped=money.nativeTaxQuotePlan(result);assert.notEqual(mapped.items[0].tax_lines[0].rate,10.25);
  const cart=native(result);money.assertNativeTaxQuoteAmounts(result,cart);assert.equal(MathBN.mult(cart.total,100).integerValue(4).toNumber(),4301);assert.equal(MathBN.mult(cart.items[0].tax_total,100).integerValue(4).toNumber(),154);
});
test("installed Order module formats the same full order amounts and retains distinct fee lines",()=>{
  const source=input({shipping_address:address("CO"),collecting_states:["CA","CO"],collecting_retail_fee_states:["CO"],shipping:{...input().shipping,amount_cents:0}}), result=quote(source,[154,154],0,28), plan=money.nativeTaxQuotePlan(result);
  const {formatOrder}=require("@medusajs/order/dist/utils/transform-order"), {Order}=require("@medusajs/order/dist/models/order");
  const order=formatOrder({id:"order_fixture",currency_code:"usd",items:[...plan.items,...plan.fees.map((fee,index)=>({...fee,id:`cali_fee${index}`}))].map(item=>({...item,detail:{fulfilled_quantity:0}})),shipping_methods:plan.shipping_methods.map(method=>({...method,detail:{}}))},{entity:Order,includeTotals:true});
  money.assertNativeTaxQuoteAmounts(result,order);assert.equal(MathBN.mult(order.total,100).integerValue(4).toNumber(),3334);assert.equal(order.items.at(-1).requires_shipping,false);assert.equal(order.items.at(-1).is_discountable,false);
});
test("retail delivery fees are separate native custom charges, including on free shipping",()=>{
  for(const state of ["CO","MN"]){
    const source=input({shipping_address:address(state),collecting_states:["CA",state],collecting_retail_fee_states:[state],lines:[{...input().lines[0],unit_price_cents:10000}],shipping:{...input().shipping,amount_cents:0}}), result=quote(source,[800],0,28), plan=money.nativeTaxQuotePlan(result);
    assert.equal(result.amounts.government_fee_cents,28);assert.equal(result.amounts.shipping_cents,0);assert.equal(result.amounts.sales_tax_cents,800);assert.equal(result.fees[0].refund_rule,"requires_review");
    assert.equal(plan.fees[0].unit_price,"0.28");assert.equal(plan.fees[0].requires_shipping,false);assert.equal(plan.fees[0].is_discountable,false);assert.equal(plan.fees[0].quantity,1);assert.deepEqual(plan.fees[0].tax_lines,[]);
    money.assertNativeTaxQuoteAmounts(result,native(result));
  }
});
test("shipping tax and government fee amounts reconcile independently",()=>{
  const source=input({shipping_address:address("CO"),collecting_states:["CA","CO"],collecting_retail_fee_states:["CO"]}), result=quote(source,[154,154],87,28);
  assert.equal(result.shipping.sales_tax_cents,87);assert.equal(result.amounts.sales_tax_cents,395);assert.equal(result.amounts.government_fee_cents,28);assert.equal(result.amounts.total_cents,4416);money.assertNativeTaxQuoteAmounts(result,native(result));
});
test("zero tax preserves exemption vs not-collecting reasons and rejects unreviewed or unsupported results",()=>{
  const source=input({shipping_address:address("NY")}), calc=calculation(source,[0,0]);
  calc.line_items.data.forEach(line=>{line.tax_breakdown[0].taxability_reason="not_collecting";});calc.tax_breakdown[0].taxability_reason="not_collecting";
  const result=money.normalizeStripeTaxQuote(source,calc,now);assert.equal(result.lines[0].breakdown[0].taxability_reason,"not_collecting");assert.equal(result.amounts.sales_tax_cents,0);
  assert.throws(()=>money.normalizeStripeTaxQuote({...source,collecting_states:["CA","NY"]},calc,now));
  for(const reason of ["not_supported","reverse_charge","customer_exempt","unknown_rule"]){const altered=structuredClone(calc);altered.line_items.data[0].tax_breakdown[0].taxability_reason=reason;assert.throws(()=>money.normalizeStripeTaxQuote(source,altered,now));}
  const exempt=calculation(input(),[0,0]);exempt.line_items.data.forEach(line=>{line.tax_breakdown[0].taxability_reason="product_exempt";});exempt.tax_breakdown[0].taxability_reason="product_exempt";assert.equal(money.normalizeStripeTaxQuote(input(),exempt,now).amounts.sales_tax_cents,0);
});
test("explicit reviewed Nontaxable classification is distinct from a missing active registration",()=>{
  const source=input();source.lines=source.lines.map(line=>({...line,tax_code:"txcd_00000000"}));const calc=calculation(source,[0,0]);
  calc.line_items.data.forEach(line=>{line.tax_breakdown[0].taxability_reason="not_collecting";});calc.tax_breakdown[0].taxability_reason="not_collecting";
  assert.equal(money.normalizeStripeTaxQuote(source,calc,now).amounts.sales_tax_cents,0);
  const mixed=structuredClone(source);mixed.lines[0].tax_code="txcd_99999999";const changed=structuredClone(calc);changed.line_items.data[0].tax_code="txcd_99999999";assert.throws(()=>money.normalizeStripeTaxQuote(mixed,changed,now));
});
test("currency, mode, dates, address, code, quantity, duplicate or missing lines and aggregate changes fail closed",()=>{
  const source=input(), base=calculation(source);
  for(const mutate of [x=>x.currency="eur",x=>x.livemode=true,x=>x.expires_at=now+300,x=>x.tax_date++,x=>x.customer_details.address.state="NY",x=>x.ship_from_details.address.line1="Other warehouse",x=>x.customer_details.address_source="billing",x=>x.customer_details.taxability_override="customer_exempt",x=>x.line_items.has_more=true,x=>x.line_items.total_count++,x=>x.line_items.data.pop(),x=>x.line_items.data[0].amount++,x=>x.line_items.data[0].amount_tax++,x=>x.line_items.data[0].tax_code="txcd_other",x=>x.line_items.data[0].quantity++,x=>x.line_items.data[1].id=x.line_items.data[0].id,x=>x.line_items.data[1].reference=x.line_items.data[0].reference,x=>x.line_items.data[0].livemode=true,x=>x.shipping_cost.amount++,x=>x.shipping_cost.tax_code="txcd_other",x=>x.tax_amount_exclusive++,x=>x.tax_breakdown[0].amount++,x=>x.amount_total++,x=>x.tax_breakdown[0].tax_rate_details.tax_type="vat",x=>x.tax_breakdown[0].tax_rate_details.rate_type="unknown",x=>x.tax_amount_inclusive=1]){
    const changed=structuredClone(base);mutate(changed);assert.throws(()=>money.normalizeStripeTaxQuote(source,changed,now));
  }
  assert.throws(()=>money.normalizeStripeTaxQuote(source,base,now-1));assert.throws(()=>money.normalizeStripeTaxQuote(source,base,now+901));
});
test("fixed fee registration and kind, amount, state or duplicate changes are rejected",()=>{
  const source=input({shipping_address:address("CO"),collecting_states:["CA","CO"],collecting_retail_fee_states:["CO"]}),base=calculation(source,[154,154],0,28);
  for(const mutate of [x=>x.tax_breakdown.at(-1).tax_rate_details.tax_type="recycling_fee",x=>x.tax_breakdown.at(-1).tax_rate_details.flat_amount.amount++,x=>x.tax_breakdown.at(-1).tax_rate_details.flat_amount.currency="eur",x=>x.tax_breakdown.at(-1).tax_rate_details.state="MN",x=>x.tax_breakdown.at(-1).taxable_amount=1,x=>x.tax_breakdown.at(-1).tax_rate_details.percentage_decimal="1",x=>x.tax_breakdown.at(-1).taxability_reason="not_collecting",x=>x.shipping_cost.amount_tax=0,x=>x.tax_breakdown.push(x.tax_breakdown.at(-1))]){const changed=structuredClone(base);mutate(changed);assert.throws(()=>money.normalizeStripeTaxQuote(source,changed,now));}
  assert.throws(()=>money.normalizeStripeTaxQuote({...source,collecting_retail_fee_states:[]},base,now));
});
test("native verification checks each line, fee flags and shipping, beyond a coincidentally equal grand total",()=>{
  const source=input({shipping_address:address("CO"),collecting_states:["CA","CO"],collecting_retail_fee_states:["CO"]}),result=quote(source,[154,154],0,28);
  for(const mutate of [x=>x.items[0].tax_total=new BigNumber("1.53"),x=>x.items[0].quantity=2,x=>x.items[0].unit_price="15.00",x=>x.items[0].is_tax_inclusive=true,x=>x.items[0].discount_subtotal="0.01",x=>x.items.at(-1).requires_shipping=true,x=>x.items.at(-1).is_discountable=true,x=>x.items.at(-1).is_custom_price=false,x=>x.items.at(-1).variant_id="variant_fixture",x=>x.items.at(-1).tax_lines=[{rate:1}],x=>x.items.at(-1).quantity=2,x=>x.items.at(-1).tax_total="0.01",x=>x.items.at(-1).metadata[money.governmentFeeMetadataKey].calculation_id="taxcalc_other",x=>x.items.pop(),x=>x.items[1].id=x.items[0].id,x=>x.shipping_methods[0].amount="10.00",x=>x.shipping_methods[0].id="casm_other",x=>x.tax_total="3.36",x=>x.discount_subtotal="0.01",x=>x.total="43.30"]){const cart=native(result);mutate(cart);assert.throws(()=>money.assertNativeTaxQuoteAmounts(result,cart));}
});

test("stored PostgreSQL float4 tax rates must reproduce the precise native computation and exact payable quote cents",()=>{
  const source=input();source.lines=[{...source.lines[0],unit_price_cents:11000,discount_cents:1001}];
  const result=quote(source,[154],87),plan=money.nativeTaxQuotePlan(result),cart=native(result);
  assert.equal(plan.items[0].tax_lines[0].rate,Math.fround(15400/9999));assert.equal(plan.shipping_methods[0].tax_lines[0].rate,Math.fround(8700/995));
  money.assertNativeTaxQuoteAmounts(result,cart);
  // This is float4-derived computed noise, not permission to accept a fractional source price or arbitrary near-cent totals.
  assert.throws(()=>money.nativeTaxUsdCents(cart.items[0].tax_total));assert.throws(()=>money.exactTaxUsdCents(cart.total));
  for(const mutate of [x=>x.items[0].tax_lines[0].rate=15400/9999,x=>x.items[0].tax_lines=[],x=>x.items[0].tax_lines.push({rate:0}),x=>x.shipping_methods[0].tax_lines[0].rate=8.75,x=>x.items[0].tax_total="1.54",x=>x.total="112.35",x=>x.total=new BigNumber(MathBN.add(x.total,"0.0000001")),x=>x.items[0].unit_price="110.000001"]){const changed=native(result);mutate(changed);assert.throws(()=>money.assertNativeTaxQuoteAmounts(result,changed));}
  const textPlan=money.nativeTaxQuotePlan(result);textPlan.items[0].tax_lines[0].rate=1.540154;textPlan.shipping_methods[0].tax_lines[0].rate=8.743718;
  money.assertNativeTaxQuoteAmounts(result,decorateCartTotals({currency_code:"usd",items:textPlan.items,shipping_methods:textPlan.shipping_methods}));
  const poolerPlan=money.nativeTaxQuotePlan(result);poolerPlan.items[0].tax_lines[0].rate=1.54015;poolerPlan.shipping_methods[0].tax_lines[0].rate=8.74372;
  money.assertNativeTaxQuoteAmounts(result,decorateCartTotals({currency_code:"usd",items:poolerPlan.items,shipping_methods:poolerPlan.shipping_methods}));
});

test("many valid per-line float4 roundings cannot change the whole-cart payable cents",()=>{
  const source=input();source.lines=Array.from({length:100},(_,index)=>({...source.lines[0],id:`cali_${index}`,unit_price_cents:499999,discount_cents:0}));source.shipping.amount_cents=0;
  const taxes=source.lines.map(()=>499998),result=quote(source,taxes,0);
  // Each native line rounds correctly; accumulation of the stored rates would change the payable total and must fail.
  const cart=native(result);
  assert.equal(MathBN.mult(cart.items[0].tax_total,100).integerValue(4).toNumber(),499998);
  assert.notEqual(MathBN.mult(cart.total,100).integerValue(4).toNumber(),result.amounts.total_cents);
  assert.throws(()=>money.assertNativeTaxQuoteAmounts(result,cart));
});
test("real installed native totals agree with exact quote cents for 160 varied full orders",()=>{
  for(let n=1;n<=160;n++){
    const source=input();source.lines=source.lines.map((line,index)=>({...line,quantity:n%7+1,unit_price_cents:1+(n*613+index*29)%30000,discount_cents:n%5}));source.shipping.amount_cents=n%2?0:995;
    const taxes=source.lines.map(line=>Math.round((line.unit_price_cents*line.quantity-line.discount_cents)*0.0875));const shipTax=source.shipping.amount_cents?87:0;
    const result=quote(source,taxes,shipTax);money.assertNativeTaxQuoteAmounts(result,native(result));
  }
});
test("successive merchandise returns conserve original net/tax cents without recomputing a rate",()=>{
  const source=input();source.lines=[{...source.lines[0],quantity:3,unit_price_cents:1000,discount_cents:1}];const result=quote(source,[154]),line=result.lines[0];
  const parts=[0,1,2].map(returned=>money.taxQuoteMerchandiseRefund(line,returned,1));assert.deepEqual(parts.map(part=>part.total_cents),[1052,1051,1050]);
  assert.equal(parts.reduce((a,part)=>a+part.net_cents,0),2999);assert.equal(parts.reduce((a,part)=>a+part.sales_tax_cents,0),154);assert.deepEqual(money.taxQuoteMerchandiseRefund(line,0,3),{quantity:3,net_cents:2999,sales_tax_cents:154,total_cents:3153});
  assert.throws(()=>money.taxQuoteMerchandiseRefund(line,2,2));assert.throws(()=>money.taxQuoteMerchandiseRefund(line,-1,1));assert.throws(()=>money.taxQuoteMerchandiseRefund(line,0,0));
  // The unmodified native prorated refund is 1051 cents, differing from the first original allocation.
  const plan=money.nativeTaxQuotePlan(result),returned=decorateCartTotals({currency_code:"usd",items:plan.items.map(item=>({...item,detail:{return_received_quantity:1}})),shipping_methods:plan.shipping_methods});
  assert.equal(MathBN.mult(returned.items[0].refundable_total,100).integerValue(4).toNumber(),2102);assert.notEqual(parts[0].total_cents,1051);
});
