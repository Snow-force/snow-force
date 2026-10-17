import type { AuthContext } from "@medusajs/framework/http";
import type { MedusaContainer } from "@medusajs/framework/types";
import { asValue } from "@medusajs/framework/awilix";
import { ContainerRegistrationKeys, decorateCartTotals, MedusaError } from "@medusajs/framework/utils";
import { listShippingOptionsForCartWorkflow } from "@medusajs/medusa/core-flows";
import { z } from "zod";
import { checkoutCartSchema, paymentStarted } from "./checkout-policy";
import { checkoutDetailsVersion } from "./checkout-details-version";
import { readOwnedTaxCartSnapshot } from "./tax-cart-sql";
import { readHistoricalNativeTaxQuote } from "./tax-quote-ledger";
import { collectDraftTaxQuote, draftEvidenceHash } from "./checkout-draft-ledger";
import { readCartTaxPreviewSource } from "./tax-quote-source";
import { createStripeTaxQuoteWriter, taxQuoteWriterRegistration, type StripeTaxQuoteWriter } from "./tax-quote-provider";
import { governmentFeeMetadataKey, normalizeTaxDiscounts, taxQuoteBindingFingerprint, taxUsdAmount } from "./tax-quote-money";
import { publicCartTaxQuote } from "./tax-quote-refresh";
import { readCartShippingPolicySnapshot } from "./shipping-coverage";
import { calculatedShippingCents, snowforcePickupCode, snowforceShippingCode, snowforceShippingProviderId } from "./shipping-policy";
import { pickupAddress, pickupConfirmationKey, readPickupOffer, sealPickupConfirmation } from "./local-pickup";
import { checkoutPolicyReview } from "./policy-consent";
import { checkoutDraftSchema, draftBaseline, sealCheckoutDraft, CheckoutDraftChangedError } from "./checkout-draft-contract";
import { withCheckoutCartLease } from "./checkout-cart-lease";

const conflict=()=>new MedusaError(MedusaError.Types.CONFLICT,"Review the latest receiving draft.");
export function assertDraftCustomer(auth:AuthContext|undefined,id:unknown){if(auth?.actor_type!=="customer"||!/^cus_[A-Za-z0-9]+$/.test(auth.actor_id))throw new MedusaError(MedusaError.Types.UNAUTHORIZED,"Sign in through SnowForce.");return z.string().regex(/^cart_[A-Za-z0-9]+$/).parse(id);}
export async function readDraftBaseline(scope:MedusaContainer,customerId:string,id:string){
  const raw=await readOwnedTaxCartSnapshot(scope.resolve(ContainerRegistrationKeys.PG_CONNECTION),id,customerId),cart=checkoutCartSchema.parse(raw);
  if(cart.completed_at||paymentStarted(cart))throw conflict();return {raw,cart,baseline:draftBaseline(raw)};
}

/** The native read-only availability workflow sees the validated destination,
 * without saving it to a cart. All other queries and dependencies remain native.
 */
export function draftAvailabilityScope(scope:MedusaContainer,id:string,address:unknown){
  const child=scope.createScope() as MedusaContainer,query=scope.resolve(ContainerRegistrationKeys.QUERY);
  const proxy=new Proxy(query,{get(target,property){if(property!=="graph"){const value=Reflect.get(target,property);return typeof value==="function"?value.bind(target):value;}
    return async (...args:Parameters<typeof query.graph>)=>{const result=await query.graph(...args),request=args[0];if(request.entity!=="cart"||request.filters?.id!==id)return result;return {...result,data:result.data.map(row=>({...row,shipping_address:address}))};};
  }});
  child.register({[ContainerRegistrationKeys.QUERY]:asValue(proxy)});return child;
}
type Availability=(scope:MedusaContainer,id:string)=>Promise<unknown>;
const nativeAvailability:Availability=async(scope,id)=>(await listShippingOptionsForCartWorkflow(scope).run({input:{cart_id:id,is_return:false}})).result;
const rawMoney=z.object({items:z.array(z.object({id:z.string(),unit_price:taxUsdAmount,quantity:z.number(),adjustments:z.array(z.object({id:z.string(),amount:taxUsdAmount,is_tax_inclusive:z.literal(false)})),metadata:z.record(z.string(),z.unknown()).nullable()}).passthrough()),shipping_methods:z.array(z.object({id:z.string(),shipping_option_id:z.string()}).passthrough())}).passthrough();

export function createCheckoutDraftPreview(availability:Availability=nativeAvailability){
return async function preview(scope:MedusaContainer,auth:AuthContext|undefined,rawId:unknown,rawDraft:unknown){
  const id=assertDraftCustomer(auth,rawId),draft=checkoutDraftSchema.parse(rawDraft);
  return withCheckoutCartLease(scope,id,async signals=>{
    const initial=await readDraftBaseline(scope,auth!.actor_id,id);if(checkoutDetailsVersion(initial.cart)!==draft.version)throw new CheckoutDraftChangedError();
    const policy=await checkoutPolicyReview(initial.cart,scope);if(!policy.policy)throw conflict();
    const money=rawMoney.parse(initial.raw),feeRows=money.items.filter(row=>row.metadata&&Object.hasOwn(row.metadata,governmentFeeMetadataKey));
    const historical=feeRows.length?await readHistoricalNativeTaxQuote(initial.cart,scope):null;
    const feeIds=feeRows.map(row=>row.id);if(feeIds.some(id=>historical!.quote.lines.some(row=>row.id===id)))throw conflict();
    const goods=money.items.filter(row=>!feeIds.includes(row.id)),discounts=normalizeTaxDiscounts(goods);
    const merchandise=discounts.reduce((sum,line)=>sum+line.net_cents,0);
    const offer=draft.kind==="pickup"?await readPickupOffer(scope):null;if(draft.kind==="pickup"&&!offer)throw conflict();
    const address=draft.kind==="delivery"?draft.address:pickupAddress(offer!,draft.contact);
    const inventory=await availability(draftAvailabilityScope(scope,id,address),id);
    const available=z.array(z.object({id:z.string(),insufficient_inventory:z.boolean()})).parse(inventory).filter(option=>!option.insufficient_inventory);
    const {data}=await scope.resolve(ContainerRegistrationKeys.QUERY).graph({entity:"shipping_option",filters:{id:available.map(option=>option.id)},fields:["id","name","provider_id","type.code"]});
    const options=z.array(z.object({id:z.string(),name:z.string(),provider_id:z.string(),type:z.object({code:z.string()})})).parse(data)
      .filter(option=>available.some(row=>row.id===option.id)&&option.provider_id===snowforceShippingProviderId&&(draft.kind==="pickup"?option.id===offer!.id&&option.type.code===snowforcePickupCode:option.type.code===snowforceShippingCode));
    if(!options.length)throw conflict();
    const project=(raw:unknown,option:{id:string;name:string},amount:number)=>{
      if(draftBaseline(raw)!==initial.baseline)throw new CheckoutDraftChangedError();
      const value=rawMoney.parse(raw),metadata={...(initial.cart.metadata??{}),[pickupConfirmationKey]:draft.kind==="pickup"?sealPickupConfirmation(initial.cart,offer!,draft.contact):null};
      const retained=value.shipping_methods.find(row=>row.shipping_option_id===option.id),method={id:retained?.id??"casm_preview"+draftBaseline({id,option:option.id}).slice(0,32),shipping_option_id:option.id,name:option.name,amount,raw_amount:{value:String(amount),precision:20},is_tax_inclusive:false,adjustments:[],tax_lines:[]};
      const projected={...value,metadata,shipping_address:address,payment_collection:null,credit_lines:[],items:goods.map(line=>({...line,tax_lines:[],adjustments:discounts.find(row=>row.id===line.id)!.adjustments.map(row=>({id:row.id,amount:row.amount,is_tax_inclusive:false}))})),shipping_methods:[method]};
      return JSON.parse(JSON.stringify(decorateCartTotals(projected)));
    };
    const priced=await Promise.all(options.map(async option=>{const provisional=checkoutCartSchema.parse(project(initial.raw,option,0));const price=calculatedShippingCents(await readCartShippingPolicySnapshot(provisional,scope),merchandise);return {...option,price:price/100};}));
    const selected=draft.kind==="pickup"?priced[0]:draft.optionId?priced.find(option=>option.id===draft.optionId):priced.find(option=>option.id===initial.cart.shipping_methods[0]?.shipping_option_id)??[...priced].sort((a,b)=>a.price-b.price||a.id.localeCompare(b.id))[0];if(!selected)throw conflict();
    const source=await readCartTaxPreviewSource(scope,auth,id,{project:raw=>project(raw,selected,selected.price),verifiedFeeIds:feeIds});
    const writer=scope.resolve<StripeTaxQuoteWriter|undefined>(taxQuoteWriterRegistration,{allowUnregistered:true})??createStripeTaxQuoteWriter();if(writer.livemode!==source.input.livemode)throw conflict();
    const {quote,id:quoteId}=await collectDraftTaxQuote(scope,source.input,source.setup.fingerprint,writer,signals);
    if(signals.some(signal=>signal?.aborted))throw conflict();
    if((await readDraftBaseline(scope,auth!.actor_id,id)).baseline!==initial.baseline)throw new CheckoutDraftChangedError();
    const currentPolicy=await checkoutPolicyReview(initial.cart,scope);if(JSON.stringify(currentPolicy.policy)!==JSON.stringify(policy.policy)||quote.expires_at<=Math.floor(Date.now()/1000)+60)throw conflict();
    const {payment_collection:_payment,metadata:_metadata,email:_email,customer_id:_customer,...safeCart}=initial.cart;
    return {status:"preview" as const,cart:{...safeCart,items:safeCart.items.filter(item=>!feeIds.includes(item.id)),customer:{id:auth!.actor_id}},token:sealCheckoutDraft({version:1,cartId:id,customerId:auth!.actor_id,baseline:initial.baseline,identity:draftBaseline({email:initial.cart.email,region:initial.cart.region_id}),draft,optionId:selected.id,quoteId,setup:source.setup.fingerprint,namespace:writer.namespace,policyVersion:policy.policy.version,policyFingerprint:draftEvidenceHash(policy.policy),expiresAt:quote.expires_at}),fingerprint:draftBaseline({binding:taxQuoteBindingFingerprint(source.input),policy:policy.policy}),taxQuote:{...publicCartTaxQuote(quote),ready:false as const},options:priced.map(({id,name,price})=>({id,name,price})),selectedOptionId:selected.id,address,pickupSelected:draft.kind==="pickup",policy:policy.policy,version:draft.version};
  });
};}
export const previewCheckoutDraft=createCheckoutDraftPreview();
