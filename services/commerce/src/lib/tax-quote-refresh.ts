import type {AuthContext} from "@medusajs/framework/http";
import type {ILockingModule,MedusaContainer} from "@medusajs/framework/types";
import {ContainerRegistrationKeys,MedusaError,Modules} from "@medusajs/framework/utils";
import {z} from "zod";
import {checkoutCartSchema,checkoutFields} from "./checkout-policy";
import {assertPersistedCartTaxQuote,taxQuoteReceiptKey} from "./tax-quote-ledger";
import {assertActiveStripeTaxSetup} from "./tax-setup";
import {withdrawCartTaxQuote} from "./tax-quote-withdrawal";
import {normalizeCartTaxMoney} from "./tax-money-normalization";
import {createCartTaxQuote} from "./tax-quote-creation";
import {applyCartTaxQuote} from "./tax-quote-application";
import type {TaxQuote} from "./tax-quote-money";

export function publicCartTaxQuote(quote:TaxQuote){return {totalCents:quote.amounts.total_cents,grossCents:quote.amounts.gross_cents,discountCents:quote.amounts.discount_cents,merchandiseCents:quote.amounts.merchandise_cents,shippingCents:quote.amounts.shipping_cents,salesTaxCents:quote.amounts.sales_tax_cents,fees:quote.fees.map(fee=>({state:fee.state,amountCents:fee.amount_cents})),expiresAt:quote.expires_at};}
const conflict=()=>new MedusaError(MedusaError.Types.CONFLICT,"Review the current cart before calculating tax. Existing evidence was preserved.");
const lease=(signals:readonly(AbortSignal|undefined)[])=>{if(signals.some(signal=>signal?.aborted)||process.env.COMMERCE_TAX_POLICY_CONFIRMED!=="true")throw conflict();};
type TaxFlow={withdraw:typeof withdrawCartTaxQuote;normalize:typeof normalizeCartTaxMoney;create:typeof createCartTaxQuote;apply:typeof applyCartTaxQuote;};
const nativeFlow:TaxFlow={withdraw:withdrawCartTaxQuote,normalize:normalizeCartTaxMoney,create:createCartTaxQuote,apply:applyCartTaxQuote};
export function createCartTaxRefresher(flow:TaxFlow=nativeFlow){
  return async function refresh(scope:MedusaContainer,auth:AuthContext|undefined,rawId:unknown,signals:readonly(AbortSignal|undefined)[]=[]){
    if(auth?.actor_type!=="customer"||!/^cus_[A-Za-z0-9]+$/.test(auth.actor_id))throw new MedusaError(MedusaError.Types.UNAUTHORIZED,"Sign in through SnowForce.");
    const id=z.string().regex(/^cart_[A-Za-z0-9]+$/).safeParse(rawId);if(!id.success)throw new MedusaError(MedusaError.Types.INVALID_DATA,"Invalid cart.");
    try{
      lease(signals);
      // Separate orchestration key: each component obtains its own checkout/native
      // leases, avoiding reentrant deadlocks while serializing repeat quote clicks.
      return await scope.resolve<ILockingModule>(Modules.LOCKING).execute(`snowforce-tax-refresh:${id.data}`,async signal=>{
        const leases=[...signals,signal];lease(leases);
        const owned=async()=>{const {data}=await scope.resolve(ContainerRegistrationKeys.QUERY).graph({entity:"cart",fields:checkoutFields,filters:{id:id.data}});if(data.length!==1||data[0].customer_id!==auth.actor_id)throw conflict();const cart=checkoutCartSchema.parse(data[0]);if(cart.completed_at||cart.payment_collection?.payment_sessions.length)throw conflict();return cart;};
        const cart=await owned();lease(leases);
        if(cart.metadata&&Object.hasOwn(cart.metadata,taxQuoteReceiptKey)){
          const current=await (async()=>assertPersistedCartTaxQuote(cart,scope,await assertActiveStripeTaxSetup(scope),"create_payment"))().catch(()=>null);
          lease(leases);
          if(current){
            const {rows}=await scope.resolve(ContainerRegistrationKeys.PG_CONNECTION).raw("select floor(extract(epoch from clock_timestamp()))::bigint as database_now");
            const now=z.array(z.object({database_now:z.coerce.number().int().positive()})).length(1).parse(rows)[0].database_now;
            if(now+60<current.quote.expires_at)return {status:"quoted" as const,reused:true,taxQuote:publicCartTaxQuote(current.quote)};
          }
        }
        const {rows:pending}=await scope.resolve(ContainerRegistrationKeys.PG_CONNECTION).raw("select id from commerce.snowforce_tax_operations where cart_id=? and customer_id=? and state='pending'",[id.data,auth.actor_id]);
        // A provider result may be unknown after a network failure. Resume the
        // persisted request without editing or normalizing its original source.
        if(!pending.length){
          await flow.withdraw(scope,auth,id.data,leases);lease(leases);
          await flow.normalize(scope,auth,id.data,leases);lease(leases);
        }else if(cart.metadata&&Object.hasOwn(cart.metadata,taxQuoteReceiptKey))throw conflict();
        const prepared=await flow.create(scope,auth,id.data,leases);lease(leases);
        await flow.apply(scope,auth,id.data,prepared.quote_id,leases);lease(leases);
        const after=await owned(),proof=await assertPersistedCartTaxQuote(after,scope,await assertActiveStripeTaxSetup(scope),"create_payment");
        if(proof.receipt.quote_id!==prepared.quote_id)throw conflict();lease(leases);
        return {status:"quoted" as const,reused:prepared.reused,taxQuote:publicCartTaxQuote(proof.quote)};
      },{timeout:15,expire:120});
    }catch{throw conflict();}
  };
}
export const refreshCartTaxQuote=createCartTaxRefresher();
