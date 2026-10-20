import type { AuthContext } from "@medusajs/framework/http";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { withCheckoutCartLease } from "./checkout-cart-lease";
import { z } from "zod";
import { checkoutCartSchema, checkoutFingerprint } from "./checkout-policy";
import { lockUnpaidCartMoney } from "./tax-money-normalization";
import { readOwnedTaxCartSnapshot, readTaxCartSql } from "./tax-cart-sql";
import { assertNativeTaxQuoteAmounts, governmentFeeMetadataKey } from "./tax-quote-money";
import { readRecordedCartTaxQuote, taxQuoteReceiptKey, type TaxQuoteConnection } from "./tax-quote-ledger";
import { policyAcceptanceKey } from "./policy-consent";
import { checkoutDetailsVersion, detailsVersionSchema } from "./checkout-details-version";

const conflict = () => new MedusaError(MedusaError.Types.CONFLICT, "Check the current quote and payment before changing this cart.");
const lease = (signals: readonly (AbortSignal | undefined)[]) => { if(signals.some(signal=>signal?.aborted)) throw conflict(); };

/** Clear only proven native quote taxes/fees on an unpaid cart. Historical
 * quote/application/payment evidence is immutable and is never deleted. */
export async function withdrawCartTaxQuote(scope: MedusaContainer, auth: AuthContext | undefined, rawId: unknown, signals: readonly (AbortSignal | undefined)[] = [], expectedDetailsVersion?: string) {
  if(auth?.actor_type!=="customer"||!/^cus_[A-Za-z0-9]+$/.test(auth.actor_id))throw new MedusaError(MedusaError.Types.UNAUTHORIZED,"Sign in through SnowForce.");
  const id=z.string().regex(/^cart_[A-Za-z0-9]+$/).safeParse(rawId);
  if(!id.success)throw new MedusaError(MedusaError.Types.INVALID_DATA,"Invalid cart.");
  try {
    lease(signals);
    return await withCheckoutCartLease(scope,id.data,async leases=>{
      lease(leases);
      const db=scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION);
      // This fresh SQL snapshot is owner-bound and includes even retired
      // sessions on the active collection. A preceding graph read adds no
      // permission: transaction row locks and financial checks still follow.
      const initial=checkoutCartSchema.parse(await readOwnedTaxCartSnapshot(db,id.data,auth.actor_id));
      if(expectedDetailsVersion!==undefined && checkoutDetailsVersion(initial)!==detailsVersionSchema.parse(expectedDetailsVersion))throw conflict();
      if(initial.customer_id!==auth.actor_id||initial.id!==id.data||initial.completed_at||initial.payment_collection?.payment_sessions.length)throw conflict();
      return db.transaction(async tx=>{
        await tx.raw("set local lock_timeout='5s'");
        await lockUnpaidCartMoney(tx,{cart:initial});
        await tx.raw("select id from commerce.credit_line where cart_id=? and deleted_at is null order by id for update",[id.data]);
        await tx.raw("select t.id from commerce.cart_line_item_tax_line t join commerce.cart_line_item i on i.id=t.item_id where i.cart_id=? and t.deleted_at is null order by t.id for update of t",[id.data]);
        await tx.raw("select t.id from commerce.cart_shipping_method_tax_line t join commerce.cart_shipping_method s on s.id=t.shipping_method_id where s.cart_id=? and t.deleted_at is null order by t.id for update of t",[id.data]);
        const pending=await tx.raw("select id from commerce.snowforce_tax_operations where cart_id=? and state='pending' order by id for update",[id.data]);
        if(pending.rows.length)throw conflict();
        lease(leases);
        const before=await readTaxCartSql(tx,id.data),cart=checkoutCartSchema.parse(before);
        const hasReceipt=!!cart.metadata&&Object.hasOwn(cart.metadata,taxQuoteReceiptKey);
        const initialHasReceipt=!!initial.metadata&&Object.hasOwn(initial.metadata,taxQuoteReceiptKey);
        if(checkoutFingerprint(cart)!==checkoutFingerprint(initial)||hasReceipt!==initialHasReceipt)throw conflict();
        if(!hasReceipt){
          const rows=z.object({items:z.array(z.object({metadata:z.record(z.string(),z.unknown()).nullable()}))}).parse(before);
          if(rows.items.some(item=>item.metadata&&Object.hasOwn(item.metadata,governmentFeeMetadataKey)))throw conflict();
          return {status:"editable" as const,quote_removed:false,review_required:true};
        }
        const signed=z.object({signature:z.string().regex(/^[a-f0-9]{64}$/)});
        if(signed.parse(cart.metadata?.[taxQuoteReceiptKey]).signature!==signed.parse(initial.metadata?.[taxQuoteReceiptKey]).signature)throw conflict();
        const {receipt,quote}=await readRecordedCartTaxQuote(tx,cart);
        assertNativeTaxQuoteAmounts(quote,before);
        const nativeRows=z.object({items:z.array(z.object({id:z.string(),metadata:z.record(z.string(),z.unknown()).nullable()}))}).parse(before);
        const fees=nativeRows.items.filter(item=>item.metadata&&Object.hasOwn(item.metadata,governmentFeeMetadataKey));
        const taxes=await tx.raw(`update commerce.cart_line_item_tax_line set deleted_at=clock_timestamp(),updated_at=clock_timestamp()
          where item_id in(select id from commerce.cart_line_item where cart_id=? and deleted_at is null)
          and deleted_at is null and provider_id='snowforce_stripe_tax' and metadata->>'quote_id'=? returning id`,[id.data,receipt.quote_id]);
        const shippingTaxes=await tx.raw(`update commerce.cart_shipping_method_tax_line set deleted_at=clock_timestamp(),updated_at=clock_timestamp()
          where shipping_method_id in(select id from commerce.cart_shipping_method where cart_id=? and deleted_at is null)
          and deleted_at is null and provider_id='snowforce_stripe_tax' and metadata->>'quote_id'=? returning id`,[id.data,receipt.quote_id]);
        if(taxes.rows.length!==quote.lines.length||shippingTaxes.rows.length!==1)throw conflict();
        for(const fee of fees){
          lease(leases);
          const removed=await tx.raw(`update commerce.cart_line_item set deleted_at=clock_timestamp(),updated_at=clock_timestamp()
            where id=? and cart_id=? and deleted_at is null and variant_id is null and product_id is null
            and is_custom_price=true and is_discountable=false and requires_shipping=false
            and metadata->'snowforce_tax_government_fee'->>'calculation_id'=?
            and metadata->'snowforce_tax_government_fee'->>'binding_fingerprint'=? returning id`,[fee.id,id.data,quote.calculation_id,quote.binding_fingerprint]);
          if(removed.rows.length!==1)throw conflict();
        }
        if(cart.payment_collection){
          const retired=await tx.raw(`delete from commerce.cart_payment_collection where cart_id=? and payment_collection_id=? and deleted_at is null
            and not exists(select 1 from commerce.payment_session where payment_collection_id=?)
            and not exists(select 1 from commerce.payment where payment_collection_id=?) returning id`,[id.data,cart.payment_collection.id,cart.payment_collection.id,cart.payment_collection.id]);
          if(retired.rows.length!==1)throw conflict();
        }
        lease(leases);
        const saved=await tx.raw(`update commerce.cart set metadata=coalesce(metadata,'{}'::jsonb)-?::text-?::text,updated_at=clock_timestamp()
          where id=? and customer_id=? and completed_at is null and deleted_at is null
          and metadata->'snowforce_tax_quote'->>'signature'=? returning id`,[taxQuoteReceiptKey,policyAcceptanceKey,id.data,auth.actor_id,receipt.signature]);
        if(saved.rows.length!==1)throw conflict();
        const after=z.object({metadata:z.record(z.string(),z.unknown()).nullable(),items:z.array(z.object({id:z.string(),tax_lines:z.array(z.unknown()).length(0)})),shipping_methods:z.array(z.object({tax_lines:z.array(z.unknown()).length(0)}))}).parse(await readTaxCartSql(tx,id.data));
        if((after.metadata&&Object.hasOwn(after.metadata,taxQuoteReceiptKey))||fees.some(fee=>after.items.some(item=>item.id===fee.id))||after.items.length!==quote.lines.length||(after.metadata&&Object.hasOwn(after.metadata,policyAcceptanceKey)))throw conflict();
        lease(leases);
        return {status:"editable" as const,quote_removed:true,review_required:true};
      });
    },signals);
  } catch { throw conflict(); }
}
