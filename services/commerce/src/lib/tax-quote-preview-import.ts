import type { AuthContext } from "@medusajs/framework/http";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";
import { readCartTaxQuoteSource } from "./tax-quote-source";
import { recordTaxQuote, reserveTaxQuote } from "./tax-quote-ledger";
import { readDraftTaxQuote } from "./checkout-draft-ledger";
import { buildStripeTaxQuoteRequest, taxQuoteRebindFingerprint } from "./tax-quote-money";
import { createStripeTaxQuoteWriter, taxQuoteWriterRegistration, type StripeTaxQuoteWriter } from "./tax-quote-provider";
import { withCheckoutCartLease } from "./checkout-cart-lease";
import { draftBaseline, type CheckoutDraft } from "./checkout-draft-contract";
import {draftEvidenceHash} from "./checkout-draft-ledger";
import {createCartTaxQuote} from "./tax-quote-creation";
import {refreshCartTaxQuote} from "./tax-quote-refresh";
import type {TaxQuoteConnection} from "./tax-quote-ledger";

/** Only explicit final review may resume a previous native request. Preview
 * stays read-only, and the original provider key/evidence is never discarded. */
export async function resumePendingDraftQuote(scope:MedusaContainer,auth:AuthContext,id:string,signals:readonly(AbortSignal|undefined)[],refresh=refreshCartTaxQuote){
  const {rows}=await scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION).raw("select id from commerce.snowforce_tax_operations where cart_id=? and customer_id=? and state='pending'",[id,auth.actor_id]);
  if(rows.length)await refresh(scope,auth,id,signals);
}

/** Rebind a private unapplied preview only when every Stripe parameter is still
 * identical. Cart/native shipping IDs may differ; provider amounts never may.
 * Existing evidence is retained and no provider calculation is repeated.
 */
export function importCheckoutPreview(quoteId:string,expectedSetup:string,expectedNamespace:string,receiving:CheckoutDraft,optionId:string,identity:string){
  return async function create(scope:MedusaContainer,auth:AuthContext|undefined,id:unknown,signals:readonly(AbortSignal|undefined)[]=[]){
    return withCheckoutCartLease(scope,z.string().regex(/^cart_[A-Za-z0-9]+$/).parse(id),async leases=>{
      const fail=()=>new MedusaError(MedusaError.Types.CONFLICT,"The preview changed. Review the latest total.");
      if(leases.some(signal=>signal?.aborted))throw fail();
      const source=await readCartTaxQuoteSource(scope,auth,id,leases),writer=scope.resolve<StripeTaxQuoteWriter|undefined>(taxQuoteWriterRegistration,{allowUnregistered:true})??createStripeTaxQuoteWriter();
      if(source.setup.fingerprint!==expectedSetup||writer.namespace!==expectedNamespace||writer.livemode!==source.input.livemode)throw fail();
      if(draftBaseline({email:source.cart.email,region:source.cart.region_id})!==identity||source.cart.shipping_methods.length!==1||source.cart.shipping_methods[0].shipping_option_id!==optionId)throw fail();
      const address=source.cart.shipping_address!;
      if(receiving.kind==="delivery"){
        if(draftEvidenceHash({...address,last_name:address.last_name??"",address_2:address.address_2??""})!==draftEvidenceHash(receiving.address))throw fail();
      }else if([address.first_name,address.last_name].filter(Boolean).join(" ")!==receiving.contact.name.split(/\s+/).join(" ")||address.phone!==receiving.contact.phone)throw fail();
      const context={setup_fingerprint:expectedSetup,namespace:expectedNamespace},record=await readDraftTaxQuote(scope,quoteId,source.cart.id,auth!.actor_id,context),preview=record.quote;
      const input={...source.input,tax_date:preview.tax_date};
      if(preview.input.cart_id!==source.cart.id||preview.input.customer_id!==auth?.actor_id||taxQuoteRebindFingerprint(preview.input)!==taxQuoteRebindFingerprint(input)||JSON.stringify(buildStripeTaxQuoteRequest(preview.input))!==JSON.stringify(buildStripeTaxQuoteRequest(input)))throw fail();
      const operation=await reserveTaxQuote(scope,input,context,quoteId);
      // A previous native request may have an unknown provider response or an
      // unapplied completed result. Resume that exact operation through the
      // established recovery path; never replace its request/calculation with a
      // different preview. The caller still checks the final total before pay.
      if(!("importedPreview" in operation))return createCartTaxQuote(scope,auth,id,leases);
      const quote=await recordTaxQuote(scope,operation.id,record.calculation,context);
      if(leases.some(signal=>signal?.aborted))throw fail();
      return {quote_id:operation.id,quote,reused:true,applied:false as const};
    },signals);
  };
}
