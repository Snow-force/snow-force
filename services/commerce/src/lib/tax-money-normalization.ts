import type { AuthContext } from "@medusajs/framework/http";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MathBN, MedusaError } from "@medusajs/framework/utils";
import { withCheckoutCartLease } from "./checkout-cart-lease";
import { z } from "zod";
import { readCartTaxMoneySource, taxQuoteSourceFields, assertTaxMoneySourceSnapshot } from "./tax-quote-source";
import { taxQuoteReceiptKey, type TaxQuoteConnection } from "./tax-quote-ledger";
import { readCartShippingPolicy } from "./shipping-coverage";
import { assertCartProductTaxClassifications } from "./tax-classification";
import { readReviewedTaxConfiguration } from "./tax-configuration";

const conflict = () => new MedusaError(MedusaError.Types.CONFLICT,"Cart changed. Review the current amounts before requesting tax.");
const same = (left:unknown,right:unknown) => JSON.stringify(left)===JSON.stringify(right);
const lease = (signals:readonly (AbortSignal|undefined)[]) => { if(signals.some(signal=>signal?.aborted))throw conflict(); };
const cartId = z.string().regex(/^cart_[A-Za-z0-9]+$/);
type MoneySource=Awaited<ReturnType<typeof readCartTaxMoneySource>>;

/** Internal callers must already own both cart leases and have an authenticated source. */
export async function lockUnpaidCartMoney(db:TaxQuoteConnection,source:Pick<MoneySource,"cart">) {
  const {cart}=source;
  const owner = await db.raw(`select id,customer_id,currency_code,region_id,completed_at,shipping_address_id from commerce.cart
    where id=? and deleted_at is null for update`,[cart.id]);
  const current = z.array(z.object({id:z.literal(cart.id),customer_id:z.literal(cart.customer_id!),currency_code:z.literal("usd"),region_id:z.literal(cart.region_id),completed_at:z.null(),shipping_address_id:z.string().nullable()})).length(1).parse(owner.rows)[0];
  if(current.shipping_address_id)await db.raw("select id from commerce.cart_address where id=? and deleted_at is null for update",[current.shipping_address_id]);
  await db.raw("select id from commerce.cart_line_item where cart_id=? and deleted_at is null order by id for update",[cart.id]);
  await db.raw(`select a.id from commerce.cart_line_item_adjustment a join commerce.cart_line_item i on i.id=a.item_id
    where i.cart_id=? and i.deleted_at is null and a.deleted_at is null order by a.id for update of a`,[cart.id]);
  await db.raw("select id from commerce.cart_shipping_method where cart_id=? and deleted_at is null order by id for update",[cart.id]);
  await db.raw(`select a.id from commerce.cart_shipping_method_adjustment a join commerce.cart_shipping_method s on s.id=a.shipping_method_id
    where s.cart_id=? and s.deleted_at is null and a.deleted_at is null order by a.id for update of a`,[cart.id]);
  await db.raw("select id from commerce.cart_payment_collection where cart_id=? order by id for update",[cart.id]);
  await db.raw(`select p.id from commerce.payment_collection p join commerce.cart_payment_collection l on l.payment_collection_id=p.id
    where l.cart_id=? order by p.id for update of p`,[cart.id]);
  await db.raw(`select s.id from commerce.payment_session s join commerce.cart_payment_collection l on l.payment_collection_id=s.payment_collection_id
    where l.cart_id=? order by s.id for update of s`,[cart.id]);
  const result=await db.raw(`select
    exists(select 1 from commerce.order_cart where cart_id=?) as has_order,
    exists(select 1 from commerce.payment_session s join commerce.cart_payment_collection l on l.payment_collection_id=s.payment_collection_id where l.cart_id=?
      and (l.deleted_at is null or s.status<>'canceled' or s.authorized_at is not null)) as has_session,
    exists(select 1 from commerce.payment p join commerce.cart_payment_collection l on l.payment_collection_id=p.payment_collection_id where l.cart_id=?) as has_payment,
    exists(select 1 from commerce.payment_collection p join commerce.cart_payment_collection l on l.payment_collection_id=p.id where l.cart_id=?
      and (p.deleted_at is not null or p.completed_at is not null or p.currency_code<>'usd' or p.status not in ('not_paid','awaiting','failed','canceled') or p.authorized_amount<>0 or p.captured_amount<>0 or p.refunded_amount<>0)) as has_collection_funds,
    (select count(*)::int from commerce.cart_payment_collection where cart_id=? and deleted_at is null) as collection_count`,[cart.id,cart.id,cart.id,cart.id,cart.id]);
  z.array(z.object({has_order:z.literal(false),has_session:z.literal(false),has_payment:z.literal(false),has_collection_funds:z.literal(false),collection_count:z.literal(cart.payment_collection?1:0)})).length(1).parse(result.rows);
}

/** Caller owns both native leases. Only local amount representation changes; no quote, tax or payment is applied. */
async function applyNormalization(source:MoneySource,scope:MedusaContainer,signals:readonly (AbortSignal|undefined)[]) {
  const updates=source.discounts.flatMap(line=>line.adjustments.flatMap(adjustment=>{
    const original=source.source.items.find(item=>item.id===line.id)?.adjustments.find(row=>row.id===adjustment.id);
    if(!original)throw conflict();
    return MathBN.eq(original.amount,adjustment.amount)?[]:[{item_id:line.id,id:adjustment.id,original:String(original.amount),cents:adjustment.amount_cents,amount:adjustment.amount}];
  }));
  const shipping=source.source.shipping_methods[0],shippingDecimal=(source.shipping_cents/100).toFixed(2);
  const shippingChanged=!MathBN.eq(shipping.amount,shippingDecimal);
  const moneyChanged=updates.length>0||shippingChanged;
  const retireEmptyCollection=!!source.cart.payment_collection&&(moneyChanged||!MathBN.eq(source.cart.payment_collection.amount,source.cart.total));
  const changed=moneyChanged||retireEmptyCollection;
  const db=scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION);
  return db.transaction(async tx=>{
    lease(signals);
    await lockUnpaidCartMoney(tx,source);
    lease(signals);
    const {data}=await scope.resolve(ContainerRegistrationKeys.QUERY).graph({entity:"cart",fields:taxQuoteSourceFields,filters:{id:source.cart.id}});
    if(data.length!==1)throw conflict();
    assertTaxMoneySourceSnapshot(source,data[0]);
    if(!same(source.shipping_policy,await readCartShippingPolicy(source.cart,scope)))throw conflict();
    // Only database reads occur under row locks; never Stripe requests.
    const lockedScope={resolve:(key:string)=>key===ContainerRegistrationKeys.PG_CONNECTION?tx:scope.resolve(key)} as MedusaContainer;
    const configuration=await readReviewedTaxConfiguration(lockedScope,source.setup);
    if(!same(configuration.active,source.configuration)||configuration.database_now-source.setup.observed_at>60||source.setup.observed_at>configuration.database_now+3)throw conflict();
    const classifications=await assertCartProductTaxClassifications(source.cart,lockedScope);
    for(const line of source.discounts){
      if(!classifications.some(row=>row.id===line.id))throw conflict();
    }
    if(!same(classifications,source.classifications))throw conflict();
    lease(signals);
    if(!changed)return {changed:false,adjustments_updated:0,retired_empty_collection:false,shipping_cents:source.shipping_cents,merchandise_cents:source.discounts.reduce((sum,line)=>sum+line.net_cents,0)};
    if(moneyChanged){
      const pending=await tx.raw("select id from commerce.snowforce_tax_operations where cart_id=? and state='pending' order by id for update",[source.cart.id]);
      if(pending.rows.length)throw conflict();
    }
    for(const update of updates){
      lease(signals);
      const result=await tx.raw(`update commerce.cart_line_item_adjustment set amount=?::numeric/100,raw_amount=?::jsonb,updated_at=clock_timestamp()
        where id=? and item_id=? and amount=?::numeric and is_tax_inclusive=false and deleted_at is null returning id`,[update.cents,JSON.stringify({value:update.amount,precision:20}),update.id,update.item_id,update.original]);
      if(result.rows.length!==1)throw conflict();
    }
    if(shippingChanged){
      lease(signals);
      const result=await tx.raw(`update commerce.cart_shipping_method set amount=?::numeric/100,raw_amount=?::jsonb,updated_at=clock_timestamp()
        where id=? and cart_id=? and amount=?::numeric and is_tax_inclusive=false and deleted_at is null returning id`,[source.shipping_cents,JSON.stringify({value:shippingDecimal,precision:20}),shipping.id,source.cart.id,String(shipping.amount)]);
      if(result.rows.length!==1)throw conflict();
    }
    if(retireEmptyCollection){
      lease(signals);
      // Preserve the empty native collection itself. Only its stale cart link retires.
      const retired=await tx.raw(`delete from commerce.cart_payment_collection where cart_id=? and payment_collection_id=?
        and not exists(select 1 from commerce.payment_session where payment_collection_id=?)
        and not exists(select 1 from commerce.payment where payment_collection_id=?) returning id`,[source.cart.id,source.cart.payment_collection!.id,source.cart.payment_collection!.id,source.cart.payment_collection!.id]);
      if(retired.rows.length!==1)throw conflict();
    }
    // A changed native amount cannot retain a previous signed quotation.
    const written=moneyChanged
      ?await tx.raw("update commerce.cart set metadata=coalesce(metadata,'{}'::jsonb)-?::text,updated_at=clock_timestamp() where id=? and customer_id=? and completed_at is null and deleted_at is null returning id",[taxQuoteReceiptKey,source.cart.id,source.cart.customer_id!])
      :await tx.raw("update commerce.cart set updated_at=clock_timestamp() where id=? and customer_id=? and completed_at is null and deleted_at is null returning id",[source.cart.id,source.cart.customer_id!]);
    if(written.rows.length!==1)throw conflict();
    lease(signals);
    return {changed:true,adjustments_updated:updates.length,retired_empty_collection:retireEmptyCollection,shipping_cents:source.shipping_cents,merchandise_cents:source.discounts.reduce((sum,line)=>sum+line.net_cents,0)};
  });
}

/** Resolve all amounts from the authenticated cart; the browser cannot request a price or rounding direction. */
export async function normalizeCartTaxMoney(scope:MedusaContainer,auth:AuthContext|undefined,rawCartId:unknown,signals:readonly (AbortSignal|undefined)[]=[]) {
  if(auth?.actor_type!=="customer"||!/^cus_[A-Za-z0-9]+$/.test(auth.actor_id))throw new MedusaError(MedusaError.Types.UNAUTHORIZED,"Sign in through SnowForce.");
  const id=cartId.safeParse(rawCartId);
  if(!id.success)throw new MedusaError(MedusaError.Types.INVALID_DATA,"Invalid cart.");
  try{
    lease(signals);
    return await withCheckoutCartLease(scope,id.data,async leases=>{
      lease(leases);
      const source=await readCartTaxMoneySource(scope,auth,id.data,leases);
      lease(leases);
      return applyNormalization(source,scope,leases);
    },signals);
  }catch{throw conflict();}
}
