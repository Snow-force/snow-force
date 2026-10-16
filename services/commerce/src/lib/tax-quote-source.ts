import { createHash } from "node:crypto";
import type { AuthContext } from "@medusajs/framework/http";
import type { MedusaContainer } from "@medusajs/framework/types";
import { BigNumber, ContainerRegistrationKeys, MathBN, MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";
import { assertCheckoutReady, assertUsCheckoutRegion, checkoutCartSchema, checkoutFields, checkoutFingerprint, paymentStarted } from "./checkout-policy";
import { readCartShippingPolicySnapshot as readCartShippingPolicy } from "./shipping-coverage";
import { calculatedShippingCents } from "./shipping-policy";
import { assertCartProductTaxClassifications } from "./tax-classification";
import { assertQuotedTaxConfiguration, readReviewedTaxConfiguration } from "./tax-configuration";
import { assertActiveStripeTaxSetup } from "./tax-setup";
import { readOwnedTaxCartSnapshot } from "./tax-cart-sql";
import { taxQuoteAddress, taxQuoteInputSchema, taxMoneyCents } from "./tax-quote-contract";
import { exactTaxUsdCents, governmentFeeMetadataKey, nativeTaxUsdCents, normalizeTaxDiscounts, taxUsdAmount } from "./tax-quote-money";

export const taxQuoteOwnerFields = ["id", "customer_id", "completed_at", "payment_collection.payment_sessions.id"];
export const taxQuoteSourceFields = [...checkoutFields.filter(field => field !== "payment_collection.payment_sessions.*"), "payment_collection.payment_sessions.id", "payment_collection.payment_sessions.provider_id", "payment_collection.payment_sessions.amount", "payment_collection.payment_sessions.currency_code", "payment_collection.payment_sessions.status", "item_subtotal", "discount_subtotal", "credit_lines.id", "items.adjustments.id", "items.adjustments.amount", "items.adjustments.is_tax_inclusive", "items.is_tax_inclusive", "items.is_custom_price", "items.metadata", "shipping_methods.adjustments.id", "shipping_methods.adjustments.amount", "shipping_methods.adjustments.is_tax_inclusive", "shipping_methods.is_tax_inclusive"];
const adjustment = z.object({ id: z.string().min(1), amount: taxUsdAmount, is_tax_inclusive:z.literal(false) });
const sourceSchema = z.object({
  item_subtotal: taxUsdAmount, discount_subtotal: taxUsdAmount,
  credit_lines: z.array(z.unknown()).length(0).default([]),
  items: z.array(z.object({
    id: z.string(), quantity: z.number().int().positive().max(10000), unit_price: taxUsdAmount,
    variant_id: z.string().nullable(), is_tax_inclusive: z.literal(false), is_custom_price: z.literal(false),
    adjustments: z.array(adjustment).max(100), metadata: z.record(z.string(), z.unknown()).nullable(),
  })).min(1).max(100),
  // Shipping discounts need their own base/discount representation in the atomic application.
  // Until then, reject them explicitly instead of losing the discount or its tax treatment.
  shipping_methods: z.array(z.object({ id: z.string(), amount: taxUsdAmount, is_tax_inclusive: z.literal(false), adjustments: z.array(adjustment).length(0) })).length(1),
});
const interrupted = () => new MedusaError(MedusaError.Types.CONFLICT, "Tax quote was interrupted. Review this cart again.");
function lease(signals: readonly (AbortSignal | undefined)[]) { if (signals.some(signal => signal?.aborted)) throw interrupted(); }
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
function fingerprint(cart: z.infer<typeof checkoutCartSchema>, source: z.infer<typeof sourceSchema>) {
  const decimal = (value: unknown) => MathBN.sub(taxUsdAmount.parse(value),0).toString();
  const items = [...source.items].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(item => ({ ...item, metadata: undefined, government_fee_marker: !!item.metadata && Object.hasOwn(item.metadata, governmentFeeMetadataKey), unit_price: decimal(item.unit_price), adjustments: [...item.adjustments].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(row => ({ id: row.id, amount: decimal(row.amount) })) }));
  return createHash("sha256").update(JSON.stringify({ cart: checkoutFingerprint(cart), item_subtotal: decimal(source.item_subtotal), discount_subtotal: decimal(source.discount_subtotal), items, shipping: source.shipping_methods.map(row => ({ ...row, amount: decimal(row.amount) })) })).digest("hex");
}

/** Server-only source: ownership precedes private reads; browser money and confirmation flags are never inputs. */
async function readQuoteSource(scope: MedusaContainer, auth: AuthContext | undefined, rawCartId: unknown, signals: readonly (AbortSignal | undefined)[], normalization: boolean) {
  if (auth?.actor_type !== "customer" || !/^cus_[A-Za-z0-9]+$/.test(auth.actor_id)) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in through SnowForce.");
  const parsedId = z.string().regex(/^cart_[A-Za-z0-9]+$/).safeParse(rawCartId);
  if (!parsedId.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid cart.");
  const ownedCartId = parsedId.data;
  lease(signals);
  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: owners } = await query.graph({ entity: "cart", fields: taxQuoteOwnerFields, filters: { id: parsedId.data } }).catch(() => { throw interrupted(); });
  if (owners.length !== 1 || owners[0]?.id !== parsedId.data || owners[0]?.customer_id !== auth.actor_id) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found.");
  const owner = z.object({ completed_at: z.unknown().nullable(), payment_collection: z.object({ payment_sessions: z.array(z.object({ id:z.string() })) }).nullable().default(null) }).safeParse(owners[0]);
  if (!owner.success || owner.data.completed_at || owner.data.payment_collection?.payment_sessions.length || process.env.COMMERCE_TAX_POLICY_CONFIRMED !== "true") throw interrupted();
  async function ownedSource() {
    // Keep both reads around external verification, but collect each native
    // amount snapshot in one statement instead of many graph round trips.
    const raw = await readOwnedTaxCartSnapshot(scope.resolve(ContainerRegistrationKeys.PG_CONNECTION), ownedCartId, auth!.actor_id).catch(() => { throw interrupted(); });
    const cart = checkoutCartSchema.safeParse(raw), source = sourceSchema.safeParse(raw);
    if (!cart.success || !source.success) throw interrupted();
    return { cart: cart.data, source: source.data };
  }
  // Read ownership before consulting policy, merchant data, products or Stripe.
  const initial = await ownedSource();
  try {
    const { cart, source } = initial;
    lease(signals);
    assertCheckoutReady(cart, process.env.COMMERCE_TAX_POLICY_CONFIRMED === "true");
    if (paymentStarted(cart) || source.items.some(item => item.metadata && Object.hasOwn(item.metadata,governmentFeeMetadataKey))) throw interrupted();
    // Independent read-only checks start together after ownership is established.
    // All must finish before contacting Stripe or constructing a quote input.
    const [{ data: regions }, shipping_policy, classifications] = await Promise.all([
      query.graph({ entity: "region", fields: ["currency_code", "countries.iso_2"], filters: { id: cart.region_id } }),
      readCartShippingPolicy(cart, scope),
      assertCartProductTaxClassifications(cart, scope),
    ]);
    if (regions.length !== 1) throw interrupted();
    assertUsCheckoutRegion(regions[0]);
    const discounts = normalizeTaxDiscounts(source.items);
    const merchandise = taxMoneyCents.parse(discounts.reduce((total,line) => total + line.net_cents, 0));
    const gross = taxMoneyCents.parse(discounts.reduce((total,line) => total + line.gross_cents, 0));
    const discount = taxMoneyCents.parse(discounts.reduce((total,line) => total + line.discount_cents, 0));
    const rawDiscount = MathBN.sum(...source.items.flatMap(item=>item.adjustments.map(row=>row.amount)));
    const rawNet = MathBN.sub(source.item_subtotal, rawDiscount);
    if (exactTaxUsdCents(source.item_subtotal) !== gross || MathBN.sub(source.discount_subtotal,rawDiscount).abs().gt("0.00000001") || MathBN.sub(MathBN.sub(cart.item_total,cart.item_tax_total),rawNet).abs().gt("0.00000001")) throw interrupted();
    const shipping_cents = calculatedShippingCents(shipping_policy,merchandise);
    if (!normalization && (nativeTaxUsdCents(source.discount_subtotal) !== discount || nativeTaxUsdCents(new BigNumber(MathBN.sub(cart.item_total, cart.item_tax_total))) !== merchandise || exactTaxUsdCents(source.shipping_methods[0].amount) !== shipping_cents)) throw interrupted();
    exactTaxUsdCents(source.shipping_methods[0].amount);
    // Gift cards, custom/fee lines, draft products and changed reviews are rejected by the native classification reader.
    lease(signals);
    const setup = await assertActiveStripeTaxSetup(scope);
    const { active, database_now } = await readReviewedTaxConfiguration(scope, setup);
    if (database_now - setup.observed_at > 60 || setup.observed_at > database_now + 3) throw interrupted();
    const address = cart.shipping_address!;
    const input = taxQuoteInputSchema.parse({
      cart_id: cart.id, customer_id: auth.actor_id, cart_fingerprint: checkoutFingerprint(cart), configuration_revision: active.revision,
      account_id: setup.account_id, livemode: setup.livemode, tax_date: database_now,
      policy_confirmed: true, california_permit_confirmed: active.content.california_permit_confirmed, obligations_reviewed: active.content.obligations_reviewed,
      collecting_states: setup.collecting_states, collecting_retail_fee_states: setup.collecting_retail_fee_states,
      shipping_address: taxQuoteAddress.parse({ country: address.country_code.toUpperCase(), state: address.province.toUpperCase(), city: address.city, line1: address.address_1, line2: address.address_2 ?? "", postal_code: address.postal_code }),
      ship_from_address: active.ship_from_address,
      lines: cart.items.map(item => {
        const review = classifications.find(line => line.id === item.id), money = discounts.find(line => line.id === item.id);
        if (!review || !money || item.variant_id !== review.variant_id || exactTaxUsdCents(item.unit_price) !== money.unit_price_cents || item.quantity !== money.quantity) throw interrupted();
        return { ...review, title: item.title, quantity: money.quantity, unit_price_cents: money.unit_price_cents, discount_cents: money.discount_cents };
      }),
      shipping: { id: source.shipping_methods[0].id, amount_cents: shipping_cents, tax_code: active.shipping_code.id },
    });
    const source_fingerprint = fingerprint(cart, source);
    // Native edits can occur while Stripe GETs are in flight. Re-read every mutable source before returning.
    lease(signals);
    const current = await ownedSource();
    if (paymentStarted(current.cart) || current.cart.completed_at || fingerprint(current.cart, current.source) !== source_fingerprint) throw interrupted();
    const [{ data: currentRegions }, currentShipping, currentClassifications] = await Promise.all([
      query.graph({ entity: "region", fields: ["currency_code", "countries.iso_2"], filters: { id: current.cart.region_id } }),
      readCartShippingPolicy(current.cart, scope),
      assertCartProductTaxClassifications(current.cart, scope),
      assertQuotedTaxConfiguration(scope, input, setup),
    ]);
    if (currentRegions.length !== 1) throw interrupted();
    assertUsCheckoutRegion(currentRegions[0]);
    if (!same(shipping_policy,currentShipping)) throw interrupted();
    if (!same(classifications, currentClassifications)) throw interrupted();
    lease(signals);
    return { cart: current.cart, source:current.source, input, source_fingerprint, discounts, setup, shipping_policy, configuration:active, classifications };
  } catch { throw new MedusaError(MedusaError.Types.CONFLICT, "Cart amounts, delivery or reviewed tax setup changed. Review before requesting a tax quote."); }
}

export async function readCartTaxQuoteSource(scope: MedusaContainer, auth: AuthContext | undefined, rawCartId: unknown, signals: readonly (AbortSignal | undefined)[] = []) {
  return readQuoteSource(scope,auth,rawCartId,signals,false);
}

/** A normalization plan only. Re-read the strict source after committing; never quote this provisional cart. */
export async function readCartTaxMoneySource(scope: MedusaContainer, auth: AuthContext | undefined, rawCartId: unknown, signals: readonly (AbortSignal | undefined)[] = []) {
  const {input,...source}=await readQuoteSource(scope,auth,rawCartId,signals,true);
  return {...source,shipping_cents:input.shipping.amount_cents};
}

/** Revalidate the exact source under native cart/line/adjustment row locks, before any write. */
export function assertTaxMoneySourceSnapshot(expected:Awaited<ReturnType<typeof readCartTaxMoneySource>>,raw:unknown){
  const value=z.object({payment_collection:z.object({payment_sessions:z.array(z.record(z.string(),z.unknown()))}).passthrough().nullable().default(null)}).passthrough().parse(raw);
  const safe={...value,payment_collection:value.payment_collection?{...value.payment_collection,payment_sessions:value.payment_collection.payment_sessions.map(session=>({...session,data:null}))}:null};
  const cart=checkoutCartSchema.parse(safe),source=sourceSchema.parse(safe);
  if(cart.customer_id!==expected.cart.customer_id||cart.id!==expected.cart.id||cart.completed_at||paymentStarted(cart)||fingerprint(cart,source)!==expected.source_fingerprint)throw interrupted();
}
