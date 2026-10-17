import type {AuthenticatedMedusaRequest,MedusaResponse} from "@medusajs/framework/http";
import type {ILockingModule} from "@medusajs/framework/types";
import {MedusaError,Modules} from "@medusajs/framework/utils";
import {addShippingMethodToCartWorkflow} from "@medusajs/medusa/core-flows";
import {z} from "zod";
import {assertDraftCustomer,readDraftBaseline} from "../../../../../../lib/checkout-draft-preview";
import {draftTokenString,openCheckoutDraft,CheckoutDraftChangedError} from "../../../../../../lib/checkout-draft-contract";
import {callCheckoutHandler} from "../../../../../../lib/checkout-handler-call";
import {createCartTaxRefresher} from "../../../../../../lib/tax-quote-refresh";
import {withdrawCartTaxQuote} from "../../../../../../lib/tax-quote-withdrawal";
import {normalizeCartTaxMoney} from "../../../../../../lib/tax-money-normalization";
import {applyCartTaxQuote} from "../../../../../../lib/tax-quote-application";
import {importCheckoutPreview,resumePendingDraftQuote} from "../../../../../../lib/tax-quote-preview-import";
import {readDraftTaxQuote,draftEvidenceHash} from "../../../../../../lib/checkout-draft-ledger";
import {checkoutDraftRoute} from "../../../../../../lib/checkout-draft-route";
import {checkoutPolicyReview} from "../../../../../../lib/policy-consent";
import {POST as details} from "../details/route";
import {GET as shipping} from "../shipping-options/route";
import {GET as status} from "../route";

const input=z.object({token:draftTokenString}).strict();
export const POST=checkoutDraftRoute(async(req:AuthenticatedMedusaRequest,res:MedusaResponse)=>{
  const id=assertDraftCustomer(req.auth_context,req.params.id),command=input.parse(req.body),token=openCheckoutDraft(command.token,id,req.auth_context.actor_id);
  const result=await req.scope.resolve<ILockingModule>(Modules.LOCKING).execute(`snowforce-draft-commit:${id}`,async signal=>{
    const initial=await readDraftBaseline(req.scope,req.auth_context.actor_id,id);
    if(initial.baseline!==token.baseline)throw new CheckoutDraftChangedError();if(signal?.aborted)throw new MedusaError(MedusaError.Types.CONFLICT,"Checkout interrupted.");
    const policy=await checkoutPolicyReview(initial.cart,req.scope);if(policy.policy?.version!==token.policyVersion||draftEvidenceHash(policy.policy)!==token.policyFingerprint)throw new MedusaError(MedusaError.Types.CONFLICT,"Review the current policy.");
    const estimate=await readDraftTaxQuote(req.scope,token.quoteId,id,req.auth_context.actor_id,{setup_fingerprint:token.setup,namespace:token.namespace});
    await resumePendingDraftQuote(req.scope,req.auth_context,id,[signal]);
    await callCheckoutHandler(details,req,token.draft.kind==="delivery"?{kind:"delivery",version:token.draft.version,address:token.draft.address}:token.draft);
    // Availability and price are re-read against the actual saved cart. A draft
    // estimate never bypasses the native inventory/delivery workflows.
    const listed=token.draft.kind==="delivery"?z.object({shipping_options:z.array(z.object({id:z.string(),name:z.string(),calculated_price:z.object({calculated_amount:z.number()})}))}).parse(await callCheckoutHandler(shipping,req)).shipping_options:[];
    const current=await readDraftBaseline(req.scope,req.auth_context.actor_id,id);
    const option=listed.find(row=>row.id===token.optionId);
    if(token.draft.kind==="delivery"){
      if(!option)throw new MedusaError(MedusaError.Types.CONFLICT,"Delivery availability changed.");
      const retained=current.cart.shipping_methods;
      if(retained.length!==1||retained[0].shipping_option_id!==option.id||Math.round(retained[0].amount*100)!==Math.round(option.calculated_price.calculated_amount*100))await addShippingMethodToCartWorkflow(req.scope).run({input:{cart_id:id,options:[{id:option.id}]}});
    }else if(current.cart.shipping_methods.length!==1||current.cart.shipping_methods[0].shipping_option_id!==token.optionId)throw new MedusaError(MedusaError.Types.CONFLICT,"Pickup availability changed.");
    if(signal?.aborted)throw new MedusaError(MedusaError.Types.CONFLICT,"Checkout interrupted.");
    const refresh=createCartTaxRefresher({withdraw:withdrawCartTaxQuote,normalize:normalizeCartTaxMoney,create:importCheckoutPreview(token.quoteId,token.setup,token.namespace,token.draft,token.optionId,token.identity),apply:applyCartTaxQuote});
    await refresh(req.scope,req.auth_context,id,[signal]);
    const review=await callCheckoutHandler(status,req);
    if(draftEvidenceHash(z.object({policy:z.unknown()}).parse(review).policy)!==token.policyFingerprint)throw new MedusaError(MedusaError.Types.CONFLICT,"Review the current policy.");
    return {review,shipping_options:listed,expected:{totalCents:estimate.quote.amounts.total_cents,policyVersion:token.policyVersion}};
  },{timeout:15,expire:120});
  res.setHeader("Cache-Control","no-store");return res.json(result);
});
