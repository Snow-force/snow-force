import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";
import { checkoutCartSchema, checkoutFields, checkoutFingerprint, type CheckoutCart } from "./checkout-policy";
import { taxFingerprint } from "./tax-classification-contract";
import { taxQuoteInputSchema } from "./tax-quote-contract";
import { assertNativeTaxQuoteAmounts, buildStripeTaxQuoteRequest, exactTaxUsdCents, normalizeStripeTaxQuote, taxQuoteBindingFingerprint, type TaxQuote } from "./tax-quote-money";
import type { TaxSetupSnapshot } from "./tax-setup-contract";
import { assertCartProductTaxClassifications } from "./tax-classification";
import { assertQuotedTaxConfiguration } from "./tax-configuration";

export type TaxQuoteConnection = {
  raw(sql: string, values?: (string | number | boolean)[]): Promise<{ rows: unknown[] }>;
  transaction<T>(operation: (db: TaxQuoteConnection) => Promise<T>): Promise<T>;
};
const dbFor = (scope: MedusaContainer) => scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION);
const fail = () => new MedusaError(MedusaError.Types.CONFLICT, "A verified, current tax quote is required before payment.");
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
// Matches the canonical request builder's fingerprint already used by the money model.
const requestHash = (input: unknown) => createHash("sha256").update(JSON.stringify(buildStripeTaxQuoteRequest(input))).digest("hex");
const epoch = z.coerce.number().int().positive().safe();
const contextSchema = z.object({ setup_fingerprint: taxFingerprint, namespace: taxFingerprint }).strict();
const operationSchema = z.object({ id: z.uuid(), input: taxQuoteInputSchema, setup_fingerprint: taxFingerprint, namespace: taxFingerprint, binding_fingerprint: taxFingerprint, request_fingerprint: taxFingerprint, request: z.unknown(), state: z.enum(["pending", "ready"]), database_now: epoch });
export const taxQuoteReceiptKey = "snowforce_tax_quote";
const unsignedReceipt = z.object({ schema_version: z.literal(1), quote_id: z.uuid(), cart_id: z.string(), customer_id: z.string().min(1), account_id: z.string(), livemode: z.boolean(), setup_fingerprint: taxFingerprint, checkout_fingerprint: taxFingerprint, total_cents: z.number().int().positive().max(99_999_999), expires_at: epoch }).strict();
const receiptSchema = unsignedReceipt.extend({ signature: taxFingerprint }).strict();
export type TaxQuoteReceipt = z.infer<typeof receiptSchema>;
function signingKey() {
  if ((process.env.JWT_SECRET?.length ?? 0) < 32) throw fail();
  return createHmac("sha256", process.env.JWT_SECRET!).update("snowforce/shop-tax-quote/v1").digest();
}
/** Only the atomic native application may persist this receipt and its private application row. */
export function sealTaxQuoteReceipt(quoteId: string, quote: TaxQuote, setupFingerprint: string, cart: CheckoutCart, nativeAmounts: unknown): TaxQuoteReceipt {
  const value = unsignedReceipt.parse({ schema_version: 1, quote_id: quoteId, cart_id: quote.input.cart_id, customer_id: quote.input.customer_id, account_id: quote.account_id, livemode: quote.livemode, setup_fingerprint: setupFingerprint, checkout_fingerprint: checkoutFingerprint(cart), total_cents: quote.amounts.total_cents, expires_at: quote.expires_at });
  if (value.cart_id !== cart.id || value.customer_id !== cart.customer_id) throw fail();
  if(checkoutFingerprint(checkoutCartSchema.parse(nativeAmounts))!==value.checkout_fingerprint)throw fail();
  assertNativeTaxQuoteAmounts(quote,nativeAmounts);
  return { ...value, signature: createHmac("sha256", signingKey()).update(JSON.stringify(value)).digest("hex") };
}
function verifyReceipt(cart: CheckoutCart) {
  const { signature, ...value } = receiptSchema.parse(cart.metadata?.[taxQuoteReceiptKey]);
  const expected = createHmac("sha256", signingKey()).update(JSON.stringify(unsignedReceipt.parse(value))).digest();
  // The signed checkout fingerprint already includes the exact native total; private proof below checks quoted payable cents.
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex")) || value.cart_id !== cart.id || value.customer_id !== cart.customer_id || value.checkout_fingerprint !== checkoutFingerprint(cart)) throw fail();
  return { ...value, signature };
}
export function assertWorkflowTaxQuoteSnapshot(initial: unknown, current: CheckoutCart) {
  const raw = z.object({ customer: z.object({ id: z.string() }).nullable(), region: z.object({ id: z.string() }).nullable() }).passthrough().parse(initial);
  const original = checkoutCartSchema.parse({ ...raw, customer_id: raw.customer?.id ?? null, region_id: raw.region?.id });
  if (verifyReceipt(original).signature !== verifyReceipt(current).signature) throw fail();
}
function checkedOperation(raw: unknown) {
  const operation = operationSchema.parse(raw);
  if (operation.binding_fingerprint !== taxQuoteBindingFingerprint(operation.input) || operation.request_fingerprint !== requestHash(operation.input) || hash(operation.request) !== hash(buildStripeTaxQuoteRequest(operation.input))) throw fail();
  return operation;
}
const operationFields = "id,input,setup_fingerprint,namespace,binding_fingerprint,request_fingerprint,request,state,floor(extract(epoch from clock_timestamp()))::bigint as database_now";
/** Persist the exact request before any future provider POST. Retrying returns the same operation/key. */
export async function reserveTaxQuote(scope: MedusaContainer, rawInput: unknown, rawContext: unknown) {
  const input = taxQuoteInputSchema.parse(rawInput), context = contextSchema.parse(rawContext);
  const binding = taxQuoteBindingFingerprint(input), request = buildStripeTaxQuoteRequest(input), requestFingerprint = requestHash(input);
  return dbFor(scope).transaction(async db => {
    const { rows: owners } = await db.raw("select id from commerce.cart where id=? and customer_id=? and completed_at is null and deleted_at is null for update", [input.cart_id, input.customer_id]);
    if (owners.length !== 1) throw fail();
    const existing = await db.raw(`select ${operationFields} from commerce.snowforce_tax_operations where cart_id=? and state='pending' order by created_at desc for update`, [input.cart_id]);
    if (existing.rows.length) {
      if (existing.rows.length !== 1) throw fail();
      const operation = checkedOperation(existing.rows[0]);
      if (operation.binding_fingerprint !== binding || operation.setup_fingerprint !== context.setup_fingerprint || operation.namespace !== context.namespace || operation.database_now < operation.input.tax_date || operation.database_now >= operation.input.tax_date + 900) throw fail();
      return operation;
    }
    // A response lost after local commit must not trigger another paid provider calculation.
    const completed = await db.raw(`select ${operationFields} from commerce.snowforce_tax_operations
      where cart_id=? and customer_id=? and state='ready'
      and exists(select 1 from commerce.snowforce_tax_quotes q where q.id=snowforce_tax_operations.id and floor(extract(epoch from clock_timestamp()))+60<q.expires_at)
      and not exists(select 1 from commerce.snowforce_tax_quote_applications a where a.quote_id=snowforce_tax_operations.id)
      order by completed_at desc,id desc limit 1`, [input.cart_id, input.customer_id]);
    if (completed.rows.length) {
      const operation = checkedOperation(z.array(z.unknown()).length(1).parse(completed.rows)[0]);
      if (operation.state !== "ready") throw fail();
      if (operation.binding_fingerprint === binding && operation.setup_fingerprint === context.setup_fingerprint && operation.namespace === context.namespace &&
        operation.database_now >= operation.input.tax_date && operation.database_now + 60 < operation.input.tax_date + 900) return operation;
    }
    const { rows: clocks } = await db.raw("select floor(extract(epoch from clock_timestamp()))::bigint as database_now");
    const now = z.array(z.object({ database_now: epoch })).length(1).parse(clocks)[0].database_now;
    if (input.tax_date > now || now - input.tax_date > 10) throw fail();
    const id = randomUUID();
    const inserted = await db.raw(`insert into commerce.snowforce_tax_operations (id,cart_id,customer_id,input,setup_fingerprint,namespace,binding_fingerprint,request_fingerprint,request)
      values (?,?,?,?::jsonb,?,?,?, ?,?::jsonb) returning ${operationFields}`, [id, input.cart_id, input.customer_id, JSON.stringify(input), context.setup_fingerprint, context.namespace, binding, requestFingerprint, JSON.stringify(request)]);
    return checkedOperation(z.array(z.unknown()).length(1).parse(inserted.rows)[0]);
  });
}

/** Reuse a complete, immutable local result without another provider POST. */
export async function readRecordedTaxQuote(scope: MedusaContainer, operationId: string, rawContext: unknown) {
  const id = z.uuid().parse(operationId), context = contextSchema.parse(rawContext);
  return dbFor(scope).transaction(async db => {
    const selected = await db.raw(`select ${operationFields} from commerce.snowforce_tax_operations where id=? for update`, [id]);
    const operation = checkedOperation(z.array(z.unknown()).length(1).parse(selected.rows)[0]);
    if (operation.state !== "ready" || operation.setup_fingerprint !== context.setup_fingerprint || operation.namespace !== context.namespace) throw fail();
    const result = await db.raw("select input,calculation,snapshot from commerce.snowforce_tax_quotes where id=?", [id]);
    const row = z.object({ input: taxQuoteInputSchema, calculation: z.unknown(), snapshot: z.unknown() }).parse(z.array(z.unknown()).length(1).parse(result.rows)[0]);
    if (hash(row.input) !== hash(operation.input)) throw fail();
    const quote = normalizeStripeTaxQuote(row.input, row.calculation, row.input.tax_date);
    if (hash(row.snapshot) !== hash(quote) || operation.database_now < quote.tax_date || operation.database_now >= quote.expires_at) throw fail();
    return quote;
  });
}
/** Validate and atomically record the immutable result; no Stripe call or native tax mutation. */
export async function recordTaxQuote(scope: MedusaContainer, operationId: string, rawCalculation: unknown, rawContext: unknown) {
  const id = z.uuid().parse(operationId), context = contextSchema.parse(rawContext);
  return dbFor(scope).transaction(async db => {
    const selected = await db.raw(`select ${operationFields} from commerce.snowforce_tax_operations where id=? for update`, [id]);
    const operation = checkedOperation(z.array(z.unknown()).length(1).parse(selected.rows)[0]);
    if (operation.setup_fingerprint !== context.setup_fingerprint || operation.namespace !== context.namespace) throw fail();
    // A replay checks the original validated result even when the request window has expired.
    const validationAt = operation.state === "ready" ? operation.input.tax_date : operation.database_now;
    const quote = normalizeStripeTaxQuote(operation.input, rawCalculation, validationAt);
    const previous = await db.raw("select snapshot from commerce.snowforce_tax_quotes where id=?", [id]);
    if (operation.state === "ready") {
      if (previous.rows.length !== 1 || hash(z.object({ snapshot: z.unknown() }).parse(previous.rows[0]).snapshot) !== hash(quote)) throw fail();
      return quote;
    }
    if (previous.rows.length || operation.database_now >= quote.expires_at) throw fail();
    await db.raw(`insert into commerce.snowforce_tax_quotes (id,cart_id,customer_id,calculation_id,account_id,livemode,setup_fingerprint,binding_fingerprint,request_fingerprint,tax_date,expires_at,total_cents,input,calculation,snapshot)
      values (?,?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?::jsonb,?::jsonb)`, [id, operation.input.cart_id, operation.input.customer_id, quote.calculation_id, quote.account_id, quote.livemode, operation.setup_fingerprint, quote.binding_fingerprint, quote.request_fingerprint, quote.tax_date, quote.expires_at, quote.amounts.total_cents, JSON.stringify(quote.input), JSON.stringify(rawCalculation), JSON.stringify(quote)]);
    const updated = await db.raw("update commerce.snowforce_tax_operations set state='ready',completed_at=clock_timestamp() where id=? and state='pending' returning id", [id]);
    if (updated.rows.length !== 1) throw fail();
    return quote;
  });
}

const proofSchema = z.object({ id: z.uuid(), input: taxQuoteInputSchema, calculation: z.unknown(), snapshot: z.unknown(), setup_fingerprint: taxFingerprint, receipt: receiptSchema,
  database_now: epoch, payment_session_id: z.string().nullable(), bound_at: epoch.nullable(), payment: z.unknown().nullable(), operation_state: z.literal("ready") });
export const taxQuoteNativeAmountFields = ["item_subtotal", "shipping_subtotal", "shipping_tax_total", "discount_subtotal", "items.tax_total", "items.tax_lines.rate", "items.discount_subtotal", "items.requires_shipping", "items.is_discountable", "items.is_tax_inclusive", "items.is_custom_price", "items.metadata", "shipping_methods.total", "shipping_methods.tax_total", "shipping_methods.tax_lines.rate"];
type ProofPurpose = "review" | "create_payment" | "complete";
async function readAppliedQuoteEvidence(cart: CheckoutCart, db: TaxQuoteConnection) {
    const receipt = verifyReceipt(cart);
    const result = await db.raw(`select q.id,q.input,q.calculation,q.snapshot,q.setup_fingerprint,a.receipt,a.payment_session_id,
      floor(extract(epoch from a.bound_at))::bigint as bound_at,floor(extract(epoch from clock_timestamp()))::bigint as database_now,o.state as operation_state,
      case when s.id is null then null else jsonb_build_object('id',s.id,'collection_id',s.payment_collection_id,'provider_id',s.provider_id,'currency_code',s.currency_code,'amount',s.amount,'status',s.status,'data',s.data,'metadata',s.metadata,'created_at',floor(extract(epoch from s.created_at))) end as payment
      from commerce.snowforce_tax_quotes q join commerce.snowforce_tax_operations o on o.id=q.id
      join commerce.snowforce_tax_quote_applications a on a.quote_id=q.id
      left join commerce.payment_session s on s.id=a.payment_session_id and s.deleted_at is null
      where q.id=? and q.cart_id=? and q.customer_id=?`, [receipt.quote_id, cart.id, cart.customer_id!]);
    const proof = proofSchema.parse(z.array(z.unknown()).length(1).parse(result.rows)[0]);
    const quote = normalizeStripeTaxQuote(proof.input, proof.calculation, proof.input.tax_date);
    if (proof.id !== receipt.quote_id || quote.input.cart_id !== cart.id || quote.input.customer_id !== cart.customer_id || proof.setup_fingerprint !== receipt.setup_fingerprint || hash(proof.receipt) !== hash(receipt) || hash(proof.snapshot) !== hash(quote) || quote.account_id !== receipt.account_id || quote.livemode !== receipt.livemode || quote.expires_at !== receipt.expires_at || quote.amounts.total_cents !== receipt.total_cents || proof.database_now < quote.tax_date) throw fail();
    return { receipt, proof, quote };
}
/** Historical money binding only; never authorizes payment creation or completion.
 * Recovery stays available after quote expiry or current tax setup changes. */
export async function readRecordedCartPaymentCents(db: TaxQuoteConnection, cart: CheckoutCart) {
  try { return (await readAppliedQuoteEvidence(cart, db)).receipt.total_cents; }
  catch { throw fail(); }
}
/** Authentic historical application only. Current setup/expiry checks remain
 * mandatory for payment; cleanup separately proves native amounts and no funds. */
export async function readRecordedCartTaxQuote(db: TaxQuoteConnection, cart: CheckoutCart) {
  try { const { receipt, quote } = await readAppliedQuoteEvidence(cart, db); return { receipt, quote }; }
  catch { throw fail(); }
}
/** Authentic native amounts for display/edit recovery. This is deliberately
 * insufficient to create a payment or complete an order. */
export async function readHistoricalNativeTaxQuote(cart: CheckoutCart, scope: MedusaContainer) {
  try {
    const evidence=await readAppliedQuoteEvidence(cart,dbFor(scope));
    const {data}=await scope.resolve(ContainerRegistrationKeys.QUERY).graph({entity:"cart",fields:[...checkoutFields,...taxQuoteNativeAmountFields],filters:{id:cart.id}});
    const current=checkoutCartSchema.parse(z.array(z.unknown()).length(1).parse(data)[0]);
    if(checkoutFingerprint(current)!==evidence.receipt.checkout_fingerprint||verifyReceipt(current).signature!==evidence.receipt.signature)throw fail();
    assertNativeTaxQuoteAmounts(evidence.quote,data[0]);
    return {...evidence,current};
  } catch { throw fail(); }
}
/** Customer metadata alone never authorizes taxes or fee lines. Read immutable evidence and native amounts. */
export async function assertPersistedCartTaxQuote(cart: CheckoutCart, scope: MedusaContainer, setup: TaxSetupSnapshot, purpose: ProofPurpose = "review") {
  try {
    const { receipt, proof, quote, current } = await readHistoricalNativeTaxQuote(cart, scope);
    if (!setup.api_ready || setup.account_id !== receipt.account_id || setup.livemode !== receipt.livemode || setup.fingerprint !== receipt.setup_fingerprint) throw fail();
    await assertQuotedTaxConfiguration(scope, quote.input, setup);
    if (proof.id !== receipt.quote_id || quote.input.cart_id !== cart.id || quote.input.customer_id !== cart.customer_id || proof.setup_fingerprint !== receipt.setup_fingerprint || hash(proof.receipt) !== hash(receipt) || hash(proof.snapshot) !== hash(quote) || quote.account_id !== receipt.account_id || quote.livemode !== receipt.livemode || quote.expires_at !== receipt.expires_at || quote.amounts.total_cents !== receipt.total_cents || proof.database_now < quote.tax_date || hash([...quote.input.collecting_states].sort()) !== hash([...setup.collecting_states].sort()) || hash([...quote.input.collecting_retail_fee_states].sort()) !== hash([...setup.collecting_retail_fee_states].sort())) throw fail();
    if (quote.lines.some(line => current.items.find(item => item.id === line.id)?.variant_id !== line.variant_id)) throw fail();
    const verifiedFeeIds = current.items.filter(item => !quote.lines.some(line => line.id === item.id)).map(item => item.id);
    const classifications = await assertCartProductTaxClassifications(current, scope, verifiedFeeIds);
    for (const line of quote.lines) {
      const classification = classifications.find(value => value.id === line.id);
      if (!classification || classification.variant_id !== line.variant_id || classification.product_id !== line.product_id || classification.tax_code !== line.tax_code || classification.classification_revision !== line.classification_revision || classification.classification_fingerprint !== line.classification_fingerprint) throw fail();
    }
    const address = current.shipping_address;
    if (!address || hash([address.country_code.toUpperCase(), address.province.toUpperCase(), address.city.trim().toUpperCase(), address.address_1.trim().toUpperCase(), (address.address_2 ?? "").trim().toUpperCase(), address.postal_code]) !== hash([quote.input.shipping_address.country, quote.input.shipping_address.state, quote.input.shipping_address.city.trim().toUpperCase(), quote.input.shipping_address.line1.trim().toUpperCase(), quote.input.shipping_address.line2.trim().toUpperCase(), quote.input.shipping_address.postal_code])) throw fail();
    // An expired quote cannot initialize or replay an ambiguous provider POST.
    // Completion/review may use a session durably created and bound before expiry.
    const expired = proof.database_now >= quote.expires_at;
    if (expired && purpose === "create_payment") throw fail();
    const sessions = current.payment_collection?.payment_sessions ?? [];
    if (sessions.length || proof.payment_session_id || expired) {
      if (!proof.payment_session_id || !proof.bound_at || proof.bound_at < quote.tax_date || proof.bound_at >= quote.expires_at) throw fail();
      const payment = z.object({ id: z.literal(proof.payment_session_id), collection_id: z.string(), provider_id: z.literal("pp_stripe_stripe"), currency_code: z.literal("usd"), amount: z.unknown(), status: z.enum(["pending", "requires_more", "pending_authorization", "authorized", "captured"]), created_at: epoch,
        data: z.record(z.string(), z.unknown()),
        metadata: z.object({ snowforce_payment_creation: z.object({ cart_id: z.literal(cart.id), customer_id: z.literal(cart.customer_id!), quote: z.literal(receipt.checkout_fingerprint), livemode: z.literal(receipt.livemode) }) }),
      }).parse(proof.payment);
      if (payment.created_at < quote.tax_date || payment.created_at > proof.bound_at || exactTaxUsdCents(payment.amount) !== receipt.total_cents || current.payment_collection?.id !== payment.collection_id || sessions.length !== 1 || sessions[0].id !== payment.id || sessions[0].data?.id !== payment.data.id) throw fail();
      if (expired || Object.hasOwn(payment.data, "id")) z.object({ id: z.string().regex(/^pi_[A-Za-z0-9]+$/), amount: z.literal(receipt.total_cents), currency: z.literal("usd"), livemode: z.literal(receipt.livemode), metadata: z.object({ session_id: z.literal(proof.payment_session_id) }) }).parse(payment.data);
      else z.object({ snowforce_payment_creation_pending: z.literal(true) }).strict().parse(payment.data);
    }
    return { receipt, quote };
  } catch (error) { if (error instanceof MedusaError && error.type === MedusaError.Types.NOT_ALLOWED) throw error; throw fail(); }
}
/** Reserve the tax/payment link in the same native session transaction, before the provider POST. */
export async function bindTaxQuotePayment(db: TaxQuoteConnection, receipt: TaxQuoteReceipt, sessionId: string) {
  const updated = await db.raw(`update commerce.snowforce_tax_quote_applications set payment_session_id=?,bound_at=coalesce(bound_at,clock_timestamp())
    where quote_id=? and receipt=?::jsonb and (payment_session_id is null or payment_session_id=?)
    and exists(select 1 from commerce.snowforce_tax_quotes q where q.id=quote_id and clock_timestamp()<to_timestamp(q.expires_at)) returning quote_id`, [sessionId, receipt.quote_id, JSON.stringify(receipt), sessionId]);
  if (updated.rows.length !== 1) throw fail();
}
