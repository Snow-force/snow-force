import { createHash } from "node:crypto";
import { BigNumber, MathBN } from "@medusajs/framework/utils";
import type { CreateLineItemDTO } from "@medusajs/framework/types";
import type Stripe from "stripe";
import { z } from "zod";
import { stripeTaxCalculationSchema, taxQuoteInputSchema, taxMoneyCents, type TaxQuoteInput } from "./tax-quote-contract";

export const taxUsdAmount=z.union([z.instanceof(BigNumber),z.number().finite().nonnegative(),z.string().regex(/^\d+(?:\.\d+)?$/)]);
const usd=taxUsdAmount;
const fail=()=>new Error("Tax quote amounts, registrations or source data do not match.");
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sum=(values:number[])=>taxMoneyCents.parse(Number(values.reduce((total,value)=>total+BigInt(taxMoneyCents.parse(value)),0n)));
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;
function centsDecimal(value:unknown) { const amount=usd.parse(value), result=MathBN.mult(amount,100);if(!result.isFinite()||result.isNegative()||result.gt(99_999_999))throw fail();return result; }
export function exactTaxUsdCents(value:unknown) {const result=centsDecimal(value);if(!result.isInteger())throw fail();return taxMoneyCents.parse(result.toNumber());}
/** Only for computed native percentage/proration noise, never source prices, adjustments or Stripe money. */
export function nativeTaxUsdCents(value:unknown) {const result=centsDecimal(value), rounded=result.integerValue(4);if(result.minus(rounded).abs().gt("0.000001"))throw fail();return taxMoneyCents.parse(rounded.toNumber());}

/** Stable largest-remainder allocation of percentage discounts; total cents are conserved. */
export function allocateRoundedTaxDiscounts(rows:{id:string;amount:unknown}[], requestedTotal?:number) {
  if(new Set(rows.map(row=>row.id)).size!==rows.length||rows.length>1000||rows.some(row=>!row.id))throw fail();
  const amounts=rows.map(row=>({id:row.id,decimal:centsDecimal(row.amount)}));
  const floors=amounts.map(row=>row.decimal.integerValue(1).toNumber());
  const target=requestedTotal===undefined?taxMoneyCents.parse(MathBN.sum(...amounts.map(row=>row.decimal)).integerValue(4).toNumber()):taxMoneyCents.parse(requestedTotal);
  const remainder=target-sum(floors);
  if(remainder<0||remainder>rows.length)throw fail();
  const rank=amounts.map((row,index)=>({index,id:row.id,fraction:row.decimal.minus(floors[index])})).sort((a,b)=>b.fraction.comparedTo(a.fraction)||order(a.id,b.id));
  for(let index=0;index<remainder;index++){if(rank[index].fraction.isZero())throw fail();floors[rank[index].index]++;}
  return rows.map((row,index)=>({id:row.id,cents:floors[index]}));
}
export function normalizeTaxDiscounts(raw:unknown) {
  const lines=z.array(z.object({id:z.string().min(1),quantity:z.number().int().positive().max(10_000),unit_price:usd,adjustments:z.array(z.object({id:z.string().min(1),amount:usd})).max(100)})).min(1).max(100).parse(raw);
  const adjustmentIds=lines.flatMap(line=>line.adjustments.map(adjustment=>adjustment.id));if(new Set(adjustmentIds).size!==adjustmentIds.length)throw fail();
  const totals=allocateRoundedTaxDiscounts(lines.map(line=>({id:line.id,amount:new BigNumber(MathBN.sum(...line.adjustments.map(adjustment=>adjustment.amount)))})));
  return lines.map((line,index)=>{
    const unit_price_cents=exactTaxUsdCents(line.unit_price),gross=taxMoneyCents.parse(unit_price_cents*line.quantity),discount_cents=totals[index].cents;
    if(discount_cents>gross||MathBN.mult(MathBN.sum(...line.adjustments.map(adjustment=>adjustment.amount)),100).gt(gross))throw fail();
    const adjustments=allocateRoundedTaxDiscounts(line.adjustments,discount_cents).map(adjustment=>({id:adjustment.id,amount_cents:adjustment.cents,amount:(adjustment.cents/100).toFixed(2)}));
    return {id:line.id,unit_price_cents,quantity:line.quantity,gross_cents:gross,discount_cents,net_cents:gross-discount_cents,adjustments};
  });
}
function canonicalInput(raw:unknown) { const input=taxQuoteInputSchema.parse(raw);return {...input,lines:input.lines.sort((a,b)=>order(a.id,b.id)),collecting_states:input.collecting_states.sort(),collecting_retail_fee_states:input.collecting_retail_fee_states.sort()}; }
export function taxQuoteBindingFingerprint(raw:unknown) {const {tax_date:_date,...input}=canonicalInput(raw);return hash(input);}
export function buildStripeTaxQuoteRequest(raw:unknown):Stripe.Tax.CalculationCreateParams {
  const input=canonicalInput(raw);
  return {currency:"usd",tax_date:input.tax_date,customer_details:{address:input.shipping_address,address_source:"shipping",taxability_override:"none"},ship_from_details:{address:input.ship_from_address},
    line_items:input.lines.map(line=>({reference:line.id,quantity:line.quantity,amount:line.unit_price_cents*line.quantity-line.discount_cents,tax_code:line.tax_code,tax_behavior:"exclusive"})),
    shipping_cost:{amount:input.shipping.amount_cents,tax_code:input.shipping.tax_code,tax_behavior:"exclusive"},expand:["line_items.data.tax_breakdown"]};
}
const reasons=new Set(["not_collecting","not_subject_to_tax","portion_product_exempt","portion_reduced_rated","portion_standard_rated","product_exempt","product_exempt_holiday","proportionally_rated","reduced_rated","standard_rated","taxable_basis_reduced","zero_rated"]);
// Stripe explicitly documents this exact code's not_collecting reason. It is never a default selection.
const stripeNontaxableCode="txcd_00000000";
function reasonValid(reason:string,amount:number,state:string,input:TaxQuoteInput,explicitNontaxable=false) {
  if(!reasons.has(reason)||(reason==="not_collecting"&&(amount!==0||input.collecting_states.includes(state)&&!explicitNontaxable))||(["product_exempt","product_exempt_holiday","not_subject_to_tax","zero_rated"].includes(reason)&&amount!==0))throw fail();
}
const addressKey=(address:{country:string;state:string;city:string;line1:string;line2?:string|null;postal_code:string})=>JSON.stringify([address.country,address.state,address.city.trim().toUpperCase(),address.line1.trim().toUpperCase(),(address.line2??"").trim().toUpperCase(),address.postal_code]);
export function normalizeStripeTaxQuote(rawInput:unknown,rawCalculation:unknown,now:number) {
  const input=canonicalInput(rawInput),calculation=stripeTaxCalculationSchema.parse(rawCalculation);
  z.number().int().positive().parse(now);
  if(calculation.livemode!==input.livemode||calculation.tax_date!==input.tax_date||input.tax_date>now||now-input.tax_date>=900||calculation.expires_at<=now+300||addressKey(calculation.customer_details.address)!==addressKey(input.shipping_address)||addressKey(calculation.ship_from_details.address)!==addressKey(input.ship_from_address))throw fail();
  const returned=calculation.line_items.data;
  if(returned.length!==input.lines.length||calculation.line_items.total_count!==input.lines.length||new Set(returned.map(line=>line.id)).size!==returned.length||new Set(returned.map(line=>line.reference)).size!==returned.length)throw fail();
  const lines=input.lines.map(source=>{
    const line=returned.find(candidate=>candidate.reference===source.id),gross=source.unit_price_cents*source.quantity,net=gross-source.discount_cents;
    if(!line||line.amount!==net||line.tax_code!==source.tax_code||line.quantity!==source.quantity||line.livemode!==input.livemode||(!net&&line.amount_tax)||sum(line.tax_breakdown.map(part=>part.amount))!==line.amount_tax)throw fail();
    for(const part of line.tax_breakdown){reasonValid(part.taxability_reason,part.amount,input.shipping_address.state,input,source.tax_code===stripeNontaxableCode);if(!part.tax_rate_details&&part.amount>0||part.taxable_amount>net)throw fail();}
    return {...source,calculation_line_id:line.id,gross_cents:gross,net_cents:net,sales_tax_cents:line.amount_tax,breakdown:line.tax_breakdown};
  });
  const fees:{state:"CO"|"MN";amount_cents:number;kind:"retail_delivery_fee";refund_rule:"requires_review"}[]=[];
  let salesTax=0;
  for(const part of calculation.tax_breakdown){
    const rate=part.tax_rate_details;
    // not_collecting for an absent retail-fee registration is separate from state sales-tax collection.
    if(rate.rate_type==="flat_amount"){
      const feeState=rate.state==="CO"?"CO":rate.state==="MN"?"MN":null;
      if(rate.tax_type!=="retail_delivery_fee"||!rate.flat_amount||!feeState||feeState!==input.shipping_address.state||part.taxable_amount!==0||Number(rate.percentage_decimal)!==0||part.amount>0&&(!input.collecting_retail_fee_states.includes(feeState)||rate.flat_amount.amount!==part.amount)||!reasons.has(part.taxability_reason)||part.taxability_reason==="not_collecting"&&part.amount!==0)throw fail();
      if(part.amount)fees.push({state:feeState,amount_cents:part.amount,kind:"retail_delivery_fee",refund_rule:"requires_review"});
    }else{
      if(rate.flat_amount||rate.tax_type!=="sales_tax"&&part.amount>0)throw fail();
      reasonValid(part.taxability_reason,part.amount,input.shipping_address.state,input,input.lines.some(line=>line.tax_code===stripeNontaxableCode)||input.shipping.tax_code===stripeNontaxableCode);salesTax=sum([salesTax,part.amount]);
    }
  }
  if(new Set(fees.map(fee=>fee.state)).size!==fees.length)throw fail();
  const feeTotal=sum(fees.map(fee=>fee.amount_cents)),itemTax=sum(lines.map(line=>line.sales_tax_cents)),shipping=calculation.shipping_cost;
  const shippingTax=shipping.amount_tax-feeTotal;
  if(shipping.amount!==input.shipping.amount_cents||shipping.tax_code!==input.shipping.tax_code||shippingTax<0||!shipping.amount&&shippingTax>0||salesTax!==itemTax+shippingTax||sum([salesTax,feeTotal])!==calculation.tax_amount_exclusive||sum(calculation.tax_breakdown.map(part=>part.amount))!==calculation.tax_amount_exclusive)throw fail();
  const merchandise=sum(lines.map(line=>line.net_cents)),gross=sum(lines.map(line=>line.gross_cents)),discount=sum(lines.map(line=>line.discount_cents));
  const total=sum([merchandise,shipping.amount,salesTax,feeTotal]);if(total!==calculation.amount_total||!total)throw fail();
  return {schema_version:1 as const,calculation_id:calculation.id,account_id:input.account_id,livemode:input.livemode,tax_date:input.tax_date,
    expires_at:Math.min(calculation.expires_at,input.tax_date+900),binding_fingerprint:taxQuoteBindingFingerprint(input),request_fingerprint:hash(buildStripeTaxQuoteRequest(input)),
    input,lines,shipping:{...input.shipping,sales_tax_cents:shippingTax},fees,breakdown:calculation.tax_breakdown,
    amounts:{gross_cents:gross,discount_cents:discount,merchandise_cents:merchandise,shipping_cents:shipping.amount,sales_tax_cents:salesTax,government_fee_cents:feeTotal,total_cents:total}};
}
export type TaxQuote=ReturnType<typeof normalizeStripeTaxQuote>;
function mappedRate(baseCents:number,taxCents:number) {
  if(!baseCents){if(taxCents)throw fail();return 0;}
  // Native cart/order tax tables persist PostgreSQL REAL, so plan the stored float4 value.
  const rate=Math.fround(MathBN.div(MathBN.mult(taxCents,100),baseCents).toNumber());if(!Number.isFinite(rate)||rate<0||rate>100)throw fail();return rate;
}
function mappedTax(baseCents:number,taxCents:number,rawRate:unknown) {
  const rate=taxUsdAmount.parse(rawRate);
  // extra_float_digits=0 emits six significant digits; positive settings emit a round-trippable float4.
  // Accept only those representations of the specific planned rate, then use native Medusa's actual value.
  const expected=mappedRate(baseCents,taxCents),number=Number(rate);
  if(Math.fround(number)!==expected&&number!==Number(expected.toPrecision(6)))throw fail();
  return MathBN.div(MathBN.mult(baseCents,rate),10_000);
}
function quotedComputedCents(value:unknown,expected:ReturnType<typeof MathBN.div>,quotedCents:number) {
  const actual=centsDecimal(value);
  // Match the specific float4 computation before comparing payable cents. This is not a general rounding allowance.
  if(actual.minus(MathBN.mult(expected,100)).abs().gt("0.000001")||actual.integerValue(4).toNumber()!==quotedCents)throw fail();
}
export const governmentFeeMetadataKey="snowforce_tax_government_fee";
/** A plan, not an applied cart. Only the private atomic application may authorize these lines. */
export function nativeTaxQuotePlan(quote:TaxQuote) {
  const items=quote.lines.map(line=>({id:line.id,title:line.title,quantity:line.quantity,unit_price:(line.unit_price_cents/100).toFixed(2),is_tax_inclusive:false,
    adjustments:line.discount_cents?[{amount:(line.discount_cents/100).toFixed(2)}]:[],tax_lines:[{rate:mappedRate(line.net_cents,line.sales_tax_cents),code:"snowforce-quoted-sales-tax",description:"Sales tax"}]}));
  const fees:CreateLineItemDTO[]=quote.fees.map(fee=>({title:`${fee.state} Retail Delivery Fee`,quantity:1,unit_price:(fee.amount_cents/100).toFixed(2),is_tax_inclusive:false,is_custom_price:true,requires_shipping:false,is_discountable:false,tax_lines:[],adjustments:[],metadata:{[governmentFeeMetadataKey]:{calculation_id:quote.calculation_id,binding_fingerprint:quote.binding_fingerprint,state:fee.state,amount_cents:fee.amount_cents}}}));
  return {items,fees,shipping_methods:[{id:quote.shipping.id,amount:(quote.shipping.amount_cents/100).toFixed(2),is_tax_inclusive:false,adjustments:[],tax_lines:[{rate:mappedRate(quote.shipping.amount_cents,quote.shipping.sales_tax_cents),code:"snowforce-quoted-shipping-tax",description:"Sales tax"}]}]};
}
/** Exact cents from original sale allocation. Never recalculate a return using today's tax rates. */
export function taxQuoteMerchandiseRefund(line:TaxQuote["lines"][number],alreadyReturned:number,quantity:number) {
  z.number().int().nonnegative().parse(alreadyReturned);z.number().int().positive().parse(quantity);
  if(alreadyReturned+quantity>line.quantity)throw fail();
  const prefix=(amount:number,count:number)=>Math.floor(amount/line.quantity)*count+Math.min(amount%line.quantity,count);
  const net=prefix(line.net_cents,alreadyReturned+quantity)-prefix(line.net_cents,alreadyReturned),tax=prefix(line.sales_tax_cents,alreadyReturned+quantity)-prefix(line.sales_tax_cents,alreadyReturned);
  return {quantity,net_cents:net,sales_tax_cents:tax,total_cents:sum([net,tax])};
}

/** Verify native cart/order amounts without accepting a whole-cent rounding discrepancy. */
export function assertNativeTaxQuoteAmounts(quote:TaxQuote,raw:unknown) {
  const native=z.object({total:usd,tax_total:usd,item_total:usd,item_tax_total:usd,item_subtotal:usd,shipping_subtotal:usd,shipping_tax_total:usd,discount_subtotal:usd,
    items:z.array(z.object({id:z.string(),quantity:z.coerce.number().int().positive(),unit_price:usd,total:usd,tax_total:usd,discount_subtotal:usd,
      tax_lines:z.array(z.object({rate:usd})).max(1),requires_shipping:z.boolean().optional(),is_discountable:z.boolean().optional(),is_tax_inclusive:z.boolean().optional(),is_custom_price:z.boolean().optional(),variant_id:z.string().nullable().optional(),metadata:z.record(z.string(),z.unknown()).nullable().optional(),
    })),shipping_methods:z.array(z.object({id:z.string(),amount:usd,total:usd,tax_total:usd,tax_lines:z.array(z.object({rate:usd})).length(1)})).length(1),
  }).parse(raw);
  const fees=native.items.filter(item=>item.metadata&&Object.hasOwn(item.metadata,governmentFeeMetadataKey));
  const merchandise=native.items.filter(item=>!fees.includes(item));
  if(new Set(native.items.map(item=>item.id)).size!==native.items.length||merchandise.length!==quote.lines.length||fees.length!==quote.fees.length)throw fail();
  const itemTaxes=[];
  for(const source of quote.lines){
    const item=merchandise.find(candidate=>candidate.id===source.id);
    if(!item||item.quantity!==source.quantity||item.is_tax_inclusive||exactTaxUsdCents(item.unit_price)!==source.unit_price_cents||nativeTaxUsdCents(item.discount_subtotal)!==source.discount_cents||item.tax_lines.length!==1)throw fail();
    const tax=mappedTax(source.net_cents,source.sales_tax_cents,item.tax_lines[0].rate);itemTaxes.push(tax);
    quotedComputedCents(item.tax_total,tax,source.sales_tax_cents);
    quotedComputedCents(item.total,MathBN.add(MathBN.div(source.net_cents,100),tax),sum([source.net_cents,source.sales_tax_cents]));
  }
  const seen=new Set<string>();
  for(const item of fees){
    const marker=z.object({calculation_id:z.literal(quote.calculation_id),binding_fingerprint:z.literal(quote.binding_fingerprint),state:z.enum(["CO","MN"]),amount_cents:taxMoneyCents}).strict().parse(item.metadata?.[governmentFeeMetadataKey]);
    const expected=quote.fees.find(fee=>fee.state===marker.state);
    if(!expected||seen.has(marker.state)||marker.amount_cents!==expected.amount_cents||item.quantity!==1||item.variant_id!=null||item.is_custom_price!==true||item.requires_shipping!==false||item.is_discountable!==false||item.is_tax_inclusive||item.tax_lines.length||exactTaxUsdCents(item.unit_price)!==expected.amount_cents||exactTaxUsdCents(item.total)!==expected.amount_cents||exactTaxUsdCents(item.tax_total)!==0||exactTaxUsdCents(item.discount_subtotal)!==0)throw fail();seen.add(marker.state);
  }
  const amount=quote.amounts,shipping=native.shipping_methods[0];
  if(shipping.id!==quote.shipping.id||exactTaxUsdCents(shipping.amount)!==amount.shipping_cents||
    exactTaxUsdCents(native.item_subtotal)!==sum([amount.gross_cents,amount.government_fee_cents])||nativeTaxUsdCents(native.discount_subtotal)!==amount.discount_cents||exactTaxUsdCents(native.shipping_subtotal)!==amount.shipping_cents)throw fail();
  const itemTax=MathBN.sum(...itemTaxes),shippingTax=mappedTax(quote.shipping.amount_cents,quote.shipping.sales_tax_cents,shipping.tax_lines[0].rate);
  quotedComputedCents(shipping.tax_total,shippingTax,quote.shipping.sales_tax_cents);
  quotedComputedCents(shipping.total,MathBN.add(MathBN.div(amount.shipping_cents,100),shippingTax),sum([amount.shipping_cents,quote.shipping.sales_tax_cents]));
  quotedComputedCents(native.tax_total,MathBN.add(itemTax,shippingTax),amount.sales_tax_cents);
  quotedComputedCents(native.item_total,MathBN.add(MathBN.div(sum([amount.merchandise_cents,amount.government_fee_cents]),100),itemTax),sum([amount.merchandise_cents,...quote.lines.map(line=>line.sales_tax_cents),amount.government_fee_cents]));
  quotedComputedCents(native.item_tax_total,itemTax,sum(quote.lines.map(line=>line.sales_tax_cents)));
  quotedComputedCents(native.shipping_tax_total,shippingTax,quote.shipping.sales_tax_cents);
  quotedComputedCents(native.total,MathBN.add(MathBN.div(sum([amount.merchandise_cents,amount.shipping_cents,amount.government_fee_cents]),100),itemTax,shippingTax),amount.total_cents);
}
