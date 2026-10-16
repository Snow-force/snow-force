import type { AuthContext } from "@medusajs/framework/http";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, generateEntityId, MedusaError } from "@medusajs/framework/utils";
import { withCheckoutCartLease } from "./checkout-cart-lease";
import { z } from "zod";
import { assertUsCheckoutRegion, checkoutCartSchema } from "./checkout-policy";
import { lockUnpaidCartMoney } from "./tax-money-normalization";
import { lockTaxApplicationSources, readTaxCartSql } from "./tax-cart-sql";
import { assertTaxMoneySourceSnapshot, readCartTaxQuoteSource, taxQuoteOwnerFields, taxQuoteSourceFields } from "./tax-quote-source";
import { assertNativeTaxQuoteAmounts, nativeTaxQuotePlan, taxQuoteBindingFingerprint } from "./tax-quote-money";
import { assertPersistedCartTaxQuote, readRecordedTaxQuote, sealTaxQuoteReceipt, taxQuoteReceiptKey, type TaxQuoteConnection } from "./tax-quote-ledger";
import { readCartShippingPolicy } from "./shipping-coverage";
import { assertCartProductTaxClassifications } from "./tax-classification";
import { readReviewedTaxConfiguration } from "./tax-configuration";
import { assertActiveStripeTaxSetup } from "./tax-setup";
import { createStripeTaxQuoteWriter, taxQuoteWriterRegistration, type StripeTaxQuoteWriter } from "./tax-quote-provider";

const conflict = () => new MedusaError(MedusaError.Types.CONFLICT, "Cart or tax quote changed. Review before applying the current amounts.");
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const lease = (signals: readonly (AbortSignal | undefined)[]) => {
  if (signals.some(signal => signal?.aborted) || process.env.COMMERCE_TAX_POLICY_CONFIRMED !== "true") throw conflict();
};

/** Private operation; source rows, tax rows, fee lines, signed reference and private evidence commit together. */
export async function applyCartTaxQuote(scope: MedusaContainer, auth: AuthContext | undefined, rawCartId: unknown, rawQuoteId: unknown,
  signals: readonly (AbortSignal | undefined)[] = []) {
  if (auth?.actor_type !== "customer" || !/^cus_[A-Za-z0-9]+$/.test(auth.actor_id)) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in through SnowForce.");
  const id = z.string().regex(/^cart_[A-Za-z0-9]+$/).safeParse(rawCartId), quoteId = z.uuid().safeParse(rawQuoteId);
  if (!id.success || !quoteId.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid cart or quote.");
  try {
    lease(signals);
    return await withCheckoutCartLease(scope, id.data, async leases => {
        lease(leases);
        const query = scope.resolve(ContainerRegistrationKeys.QUERY);
        const { data: owners } = await query.graph({ entity: "cart", fields: [...taxQuoteOwnerFields, "metadata"], filters: { id: id.data } });
        const owner = z.array(z.object({ id: z.literal(id.data), customer_id: z.literal(auth.actor_id), completed_at: z.null(),
          metadata: z.record(z.string(), z.unknown()).nullable(), payment_collection: z.object({ payment_sessions: z.array(z.unknown()).length(0) }).nullable().default(null),
        })).length(1).parse(owners)[0];
        lease(leases);
        if (owner.metadata && Object.hasOwn(owner.metadata, taxQuoteReceiptKey)) {
          const existing = z.object({ quote_id: z.literal(quoteId.data) }).parse(owner.metadata[taxQuoteReceiptKey]);
          const { data } = await query.graph({ entity: "cart", fields: taxQuoteSourceFields, filters: { id: id.data } });
          const current = checkoutCartSchema.parse(data[0]);
          const proof = await assertPersistedCartTaxQuote(current, scope, await assertActiveStripeTaxSetup(scope));
          if (proof.receipt.quote_id !== existing.quote_id) throw conflict();
          lease(leases);
          return { quote_id: quoteId.data, applied: true as const, reused: true, amounts: proof.quote.amounts };
        }
        const source = await readCartTaxQuoteSource(scope, auth, id.data, leases);
        const writer = scope.resolve<StripeTaxQuoteWriter | undefined>(taxQuoteWriterRegistration, { allowUnregistered: true }) ?? createStripeTaxQuoteWriter();
        if (writer.livemode !== source.input.livemode) throw conflict();
        const context = { namespace: writer.namespace, setup_fingerprint: source.setup.fingerprint };
        const quote = await readRecordedTaxQuote(scope, quoteId.data, context);
        if (quote.input.cart_id !== source.cart.id || quote.input.customer_id !== auth.actor_id || quote.binding_fingerprint !== taxQuoteBindingFingerprint(source.input)) throw conflict();
        lease(leases);
        const moneySource = { ...source, shipping_cents: source.input.shipping.amount_cents };
        const plan = nativeTaxQuotePlan(quote);
        return scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION).transaction(async tx => {
          lease(leases);
          // Locks have a bounded wait. No Stripe or carrier call occurs in this transaction.
          await lockTaxApplicationSources(tx);
          await lockUnpaidCartMoney(tx, moneySource);
          await tx.raw("select id from commerce.credit_line where cart_id=? and deleted_at is null order by id for update", [id.data]);
          await tx.raw("select t.id from commerce.cart_line_item_tax_line t join commerce.cart_line_item i on i.id=t.item_id where i.cart_id=? and t.deleted_at is null order by t.id for update of t", [id.data]);
          await tx.raw("select t.id from commerce.cart_shipping_method_tax_line t join commerce.cart_shipping_method s on s.id=t.shipping_method_id where s.cart_id=? and t.deleted_at is null order by t.id for update of t", [id.data]);
          const pending = await tx.raw("select id from commerce.snowforce_tax_operations where cart_id=? and state='pending' order by id for update", [id.data]);
          const applied = await tx.raw("select quote_id from commerce.snowforce_tax_quote_applications where quote_id=? for update", [quoteId.data]);
          if (pending.rows.length || applied.rows.length) throw conflict();
          const clock = async () => {
            const result = await tx.raw("select floor(extract(epoch from clock_timestamp()))::bigint as database_now");
            const now = z.array(z.object({ database_now: z.coerce.number().int().positive() })).length(1).parse(result.rows)[0].database_now;
            if (now < quote.tax_date || now >= quote.expires_at || now - source.setup.observed_at > 60 || source.setup.observed_at > now + 3) throw conflict();
          };
          await clock();
          lease(leases);
          const before = await readTaxCartSql(tx, id.data);
          assertTaxMoneySourceSnapshot(moneySource, before);
          const lockedScope = { resolve: (key: string) => key === ContainerRegistrationKeys.PG_CONNECTION ? tx : scope.resolve(key) } as MedusaContainer;
          const configuration = await readReviewedTaxConfiguration(lockedScope, source.setup);
          if (!same(configuration.active, source.configuration)) throw conflict();
          if (!same(await assertCartProductTaxClassifications(source.cart, lockedScope), source.classifications)) throw conflict();
          if (!same(await readCartShippingPolicy(source.cart, lockedScope), source.shipping_policy)) throw conflict();
          const { data: regions } = await query.graph({ entity: "region", fields: ["currency_code", "countries.iso_2"], filters: { id: source.cart.region_id } });
          if (regions.length !== 1) throw conflict(); assertUsCheckoutRegion(regions[0]);
          // Only a verified empty, unfunded collection may lose its stale cart link; keep its full record.
          if (source.cart.payment_collection) {
            const retired = await tx.raw(`delete from commerce.cart_payment_collection where cart_id=? and payment_collection_id=?
              and not exists(select 1 from commerce.payment_session where payment_collection_id=?)
              and not exists(select 1 from commerce.payment where payment_collection_id=?) returning id`, [id.data, source.cart.payment_collection.id, source.cart.payment_collection.id, source.cart.payment_collection.id]);
            if (retired.rows.length !== 1) throw conflict();
          }
          await tx.raw("update commerce.cart_line_item_tax_line set deleted_at=clock_timestamp(),updated_at=clock_timestamp() where item_id in(select id from commerce.cart_line_item where cart_id=?) and deleted_at is null", [id.data]);
          await tx.raw("update commerce.cart_shipping_method_tax_line set deleted_at=clock_timestamp(),updated_at=clock_timestamp() where shipping_method_id in(select id from commerce.cart_shipping_method where cart_id=?) and deleted_at is null", [id.data]);
          const marker = JSON.stringify({ quote_id: quoteId.data });
          for (const item of plan.items) {
            lease(leases);
            const tax = item.tax_lines[0];
            await tx.raw(`insert into commerce.cart_line_item_tax_line(id,item_id,code,rate,description,provider_id,metadata)
              values (?,?,?,?::numeric,?,'snowforce_stripe_tax',?::jsonb)`, [generateEntityId(undefined, "calitxl"), item.id, tax.code, String(tax.rate), tax.description, JSON.stringify({ quote_id: quoteId.data, cart_line_id: item.id })]);
          }
          for (const method of plan.shipping_methods) {
            lease(leases);
            const tax = method.tax_lines[0];
            await tx.raw(`insert into commerce.cart_shipping_method_tax_line(id,shipping_method_id,code,rate,description,provider_id,metadata)
              values (?,?,?,?::numeric,?,'snowforce_stripe_tax',?::jsonb)`, [generateEntityId(undefined, "casmtxl"), method.id, tax.code, String(tax.rate), tax.description, marker]);
          }
          for (const fee of plan.fees) {
            lease(leases);
            await tx.raw(`insert into commerce.cart_line_item(id,cart_id,title,quantity,unit_price,raw_unit_price,variant_id,product_id,is_tax_inclusive,is_custom_price,requires_shipping,is_discountable,metadata)
              values (?,?,?,1,?::numeric,?::jsonb,null,null,false,true,false,false,?::jsonb)`, [generateEntityId(undefined, "cali"), id.data, fee.title, String(fee.unit_price), JSON.stringify({ value: String(fee.unit_price), precision: 20 }), JSON.stringify(fee.metadata)]);
          }
          lease(leases);
          const after = await readTaxCartSql(tx, id.data);
          assertNativeTaxQuoteAmounts(quote, after);
          const cart = checkoutCartSchema.parse(after);
          const receipt = sealTaxQuoteReceipt(quoteId.data, quote, source.setup.fingerprint, cart, after);
          await tx.raw("insert into commerce.snowforce_tax_quote_applications(quote_id,receipt) values (?,?::jsonb)", [quoteId.data, JSON.stringify(receipt)]);
          const written = await tx.raw(`update commerce.cart set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{snowforce_tax_quote}',?::jsonb,true),updated_at=clock_timestamp()
            where id=? and customer_id=? and completed_at is null and deleted_at is null returning id`, [JSON.stringify(receipt), id.data, auth.actor_id]);
          if (written.rows.length !== 1) throw conflict();
          await clock(); lease(leases);
          return { quote_id: quoteId.data, applied: true as const, reused: false, amounts: quote.amounts };
        });
      }, signals);
  } catch { throw conflict(); }
}
