import { createHash } from "node:crypto";
import type { AuthContext } from "@medusajs/framework/http";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import Stripe from "stripe";
import { z } from "zod";
import { taxClassificationCommandSchema, taxClassificationStateSchema, taxCodeSchema, taxCodeId, taxProductId, supportedProductTaxCode, type TaxCode, type TaxClassificationCommand, type TaxClassificationState } from "./tax-classification-contract";
import type { CheckoutCart } from "./checkout-policy";
import { readHistoricalNativeTaxQuote } from "./tax-quote-ledger";

// Native Store metadata is admin-only. Do not put staff audit data in public Product metadata.
export const taxClassificationKey = "snowforce_tax_classifications";
export type TaxClassificationConnection = { raw(sql: string, bindings?: (string | number)[]): Promise<{ rows: unknown[] }>; transaction<T>(action: (db: TaxClassificationConnection) => Promise<T>): Promise<T> };
export type TaxCodeReader = { list(cursor?: string): Promise<unknown>; retrieve(id: string): Promise<unknown> };
const unavailable = () => new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Product tax classification is unavailable. No tax or payment was requested.");
const conflict = () => new MedusaError(MedusaError.Types.CONFLICT, "Product or tax review changed. Reload before saving.");
const invalid = () => new MedusaError(MedusaError.Types.INVALID_DATA, "Choose an official tax code and confirm the product review.");
function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> { const parsed = schema.safeParse(value); if (!parsed.success) throw invalid(); return parsed.data; }
function actor(auth: AuthContext | undefined) { if (auth?.actor_type !== "user" || !/^user_[A-Za-z0-9]+$/.test(auth.actor_id)) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in to the shop admin."); return auth.actor_id; }
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function taxClassificationReviewFingerprint(productId: string, review: TaxClassificationState["history"][number]) {
  return digest({ product_id: taxProductId.parse(productId), revision: review.revision, source_fingerprint: review.source_fingerprint, code: taxCodeSchema.parse(review.code), tax_behavior: review.tax_behavior });
}
const nullableText = z.string().nullable();
const sourceSchema = z.object({
  id: taxProductId, title: z.string(), status: z.string(), subtitle: nullableText, description: nullableText,
  type_id: nullableText, is_giftcard: z.boolean(), material: nullableText, hs_code: nullableText, origin_country: nullableText,
  variants: z.array(z.object({ id: z.string(), title: z.string(), material: nullableText, hs_code: nullableText, origin_country: nullableText })),
});
type ProductSource = z.infer<typeof sourceSchema>;
export function taxProductFingerprint(raw: unknown) { const { status: _status, ...source } = sourceSchema.parse(raw); return digest({ ...source, variants: source.variants.sort((a, b) => a.id.localeCompare(b.id)) }); }
const productSelect = `select p.id,p.title,p.status,p.subtitle,p.description,p.type_id,p.is_giftcard,p.material,p.hs_code,p.origin_country,
  coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'title',v.title,'material',v.material,'hs_code',v.hs_code,'origin_country',v.origin_country) order by v.id) from commerce.product_variant v where v.product_id=p.id and v.deleted_at is null),'[]'::jsonb) as variants
  from commerce.product p where p.deleted_at is null`;
const dbFor = (scope: MedusaContainer) => scope.resolve<TaxClassificationConnection>(ContainerRegistrationKeys.PG_CONNECTION);
async function readProduct(db: TaxClassificationConnection, id: string, lock = false) {
  const result = await db.raw(`${productSelect} and p.id=?${lock ? " for update of p" : ""}`, [id]);
  if (!result.rows.length) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found.");
  return z.array(sourceSchema).length(1).parse(result.rows)[0];
}
const storeSchema = z.object({ id: z.string(), settings: z.record(z.string(), z.unknown()).nullable(), database_now: z.union([z.date(), z.string()]).transform(value => new Date(value).toISOString()) });
async function readStore(db: TaxClassificationConnection, lock = false) {
  const result = await db.raw(`select id,metadata->'snowforce_tax_classifications' as settings,current_timestamp as database_now from commerce.store where deleted_at is null order by created_at,id limit 2${lock ? " for update" : ""}`);
  return z.array(storeSchema).length(1).parse(result.rows)[0];
}
function stateFor(settings: Record<string, unknown> | null, id: string) { return settings && Object.hasOwn(settings, id) ? taxClassificationStateSchema.parse(settings[id]) : null; }
function projection(source: ProductSource, state: TaxClassificationState | null, at: string) {
  const source_fingerprint = taxProductFingerprint(source), latest = state?.history.at(-1);
  return { id: source.id, title: source.title, status: source.status, variant_count: source.variants.length, source_fingerprint, state, ready: !!latest && !source.is_giftcard && latest.source_fingerprint === source_fingerprint && supportedProductTaxCode(latest.code) && Date.parse(latest.reviewed_at) <= Date.parse(at), unsupported: source.is_giftcard };
}
export function createTaxCodeReader(client?: Pick<Stripe, "taxCodes">): TaxCodeReader {
  if (!client) {
    const key = process.env.COMMERCE_STRIPE_API_KEY;
    if (!key || !/^(sk|rk)_(test|live)_/.test(key)) throw unavailable();
    client = new Stripe(key, { apiVersion: "2026-09-30.endive", timeout: 15000, maxNetworkRetries: 1 });
  }
  const codes = client.taxCodes;
  return { list: cursor => codes.list({ limit: 100, ...(cursor ? { starting_after: taxCodeId.parse(cursor) } : {}) }), retrieve: id => codes.retrieve(taxCodeId.parse(id)) };
}
export async function adminTaxCodes(auth: AuthContext | undefined, reader?: TaxCodeReader) {
  actor(auth);
  try {
    const api = reader ?? createTaxCodeReader(), codes: TaxCode[] = [], seen = new Set<string>(); let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const result = z.object({ has_more: z.boolean(), data: z.array(taxCodeSchema).max(100) }).parse(await api.list(cursor));
      for (const code of result.data) { if (seen.has(code.id)) throw unavailable(); seen.add(code.id); codes.push(code); }
      if (!result.has_more) return { codes, fetched_at: new Date().toISOString() };
      if (!result.data.length) throw unavailable();
      cursor = result.data.at(-1)!.id;
    }
    throw unavailable();
  } catch { throw unavailable(); }
}
export async function adminTaxProducts(scope: MedusaContainer, auth: AuthContext | undefined, offset: unknown = 0) {
  actor(auth); const page = parse(z.union([z.number(), z.string().regex(/^\d+$/)]).transform(Number).pipe(z.number().int().min(0).max(1_000_000)), offset);
  try {
    const db = dbFor(scope), store = await readStore(db);
    const result = await db.raw(`with products as (${productSelect}), page as (select * from products order by title,id limit 50 offset ?) select coalesce((select jsonb_agg(page order by title,id) from page),'[]'::jsonb) as products,(select count(*) from products) as count`, [page]);
    const row = z.object({ products: z.array(sourceSchema).max(50), count: z.coerce.number().int().nonnegative().safe() }).parse(result.rows[0]);
    return { products: row.products.map(source => projection(source, stateFor(store.settings, source.id), store.database_now)), count: row.count, offset: page, limit: 50 as const };
  } catch (error) { if (error instanceof MedusaError) throw error; throw unavailable(); }
}
const commandDigest = (id: string, staff: string, input: TaxClassificationCommand) => digest({ id, staff, expected_revision: input.expected_revision, source_fingerprint: input.source_fingerprint, tax_code: input.tax_code, confirm_review: input.confirm_review, note: input.note });
export function applyTaxClassification(previous: TaxClassificationState | null, source: ProductSource, input: TaxClassificationCommand, code: TaxCode, staff: string, at: string) {
  const hash = commandDigest(source.id, staff, input), prior = previous?.history.find(entry => entry.request_id === input.request_id);
  if (prior) { if (prior.digest !== hash) throw conflict(); return { state: previous!, replayed: true, applied_revision: prior.revision }; }
  const revision = previous?.revision ?? 0;
  if (revision !== input.expected_revision || revision >= 100 || taxProductFingerprint(source) !== input.source_fingerprint || source.is_giftcard || code.id !== input.tax_code || !supportedProductTaxCode(code)) throw conflict();
  const next = taxClassificationStateSchema.parse({ schema_version: 1, revision: revision + 1, history: [...(previous?.history ?? []), { revision: revision + 1, request_id: input.request_id, digest: hash, reviewed_at: at, reviewed_by: staff, source_fingerprint: input.source_fingerprint, code, tax_behavior: "exclusive", note: input.note }] });
  return { state: next, replayed: false, applied_revision: next.revision };
}
export async function saveTaxClassification(scope: MedusaContainer, auth: AuthContext | undefined, productId: unknown, raw: unknown, reader?: TaxCodeReader) {
  const staff = actor(auth), id = parse(taxProductId, productId), input = parse(taxClassificationCommandSchema, raw);
  try {
    const db = dbFor(scope), source = await readProduct(db, id), initial = await readStore(db), previous = stateFor(initial.settings, id);
    const prior = previous?.history.find(entry => entry.request_id === input.request_id);
    if (prior) { if (prior.digest !== commandDigest(id, staff, input)) throw conflict(); return { product: projection(source, previous, initial.database_now), replayed: true, applied_revision: prior.revision }; }
    if ((previous?.revision ?? 0) !== input.expected_revision || taxProductFingerprint(source) !== input.source_fingerprint || source.is_giftcard) throw conflict();
    // GET an exact, existing code before opening the database transaction. No Stripe writes.
    const code = taxCodeSchema.parse(await (reader ?? createTaxCodeReader()).retrieve(input.tax_code));
    return await db.transaction(async tx => {
      const store = await readStore(tx, true), locked = await readProduct(tx, id, true), state = stateFor(store.settings, id);
      const result = applyTaxClassification(state, locked, input, code, staff, store.database_now);
      if (!result.replayed) {
        // Change only the selected product entry, preserving all other Store settings and audit histories.
        const written = await tx.raw(`update commerce.store set metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{snowforce_tax_classifications}',coalesce(metadata->'snowforce_tax_classifications','{}'::jsonb)||jsonb_build_object(?::text,?::jsonb),true),updated_at=now() where id=? and deleted_at is null returning id`, [id, JSON.stringify(result.state), store.id]);
        if (written.rows.length !== 1) throw conflict();
      }
      return { product: projection(locked, result.state, store.database_now), replayed: result.replayed, applied_revision: result.applied_revision };
    });
  } catch (error) { if (error instanceof MedusaError) throw error; throw unavailable(); }
}
/** Authoritative native items only. Missing, changed, custom or unsupported products stop payment. */
export async function assertCartProductTaxClassifications(cart: CheckoutCart, scope: MedusaContainer, verifiedFeeIds: readonly string[] = []) {
  try {
    const db = dbFor(scope), store = await readStore(db);
    const result = await db.raw(`select li.id,li.variant_id,v.product_id from commerce.cart_line_item li left join commerce.product_variant v on v.id=li.variant_id and v.deleted_at is null where li.cart_id=? and li.deleted_at is null order by li.id`, [cart.id]);
    const all = z.array(z.object({ id: z.string(), variant_id: z.string().nullable(), product_id: taxProductId.nullable() })).min(1).parse(result.rows);
    if (!verifiedFeeIds.length && all.some(line => line.variant_id === null)) {
      // This verifier re-enters only with fee IDs already checked against immutable private/native evidence.
      const proof = await readHistoricalNativeTaxQuote(cart, scope);
      const feeIds = cart.items.filter(item => !proof.quote.lines.some(line => line.id === item.id)).map(item => item.id);
      if (!feeIds.length) throw conflict();
      return assertCartProductTaxClassifications(cart, scope, feeIds);
    }
    // Only the private quote verifier may supply IDs after checking every fee's native flags and amounts.
    const fees = new Set(verifiedFeeIds);
    if (fees.size !== verifiedFeeIds.length || all.filter(line => fees.has(line.id)).length !== fees.size || all.some(line => fees.has(line.id) && (line.variant_id !== null || line.product_id !== null))) throw conflict();
    const lines = all.filter(line => !fees.has(line.id));
    const expected = [...cart.items].filter(line => !fees.has(line.id)).sort((a,b) => a.id.localeCompare(b.id));
    if (lines.length !== expected.length || lines.some((line,index) => line.id !== expected[index].id || !line.variant_id || !line.product_id || line.variant_id !== expected[index].variant_id)) throw conflict();
    const ids = new Set(lines.map(line => line.product_id));
    const sources = await db.raw(`${productSelect} and p.id in (select v.product_id from commerce.product_variant v join commerce.cart_line_item li on li.variant_id=v.id where li.cart_id=? and li.deleted_at is null and v.deleted_at is null)`, [cart.id]);
    const products = z.array(sourceSchema).min(1).parse(sources.rows);
    if (products.length !== ids.size || new Set(products.map(product => product.id)).size !== products.length) throw conflict();
    const reviewed = new Map<string, { tax_code: string; classification_revision: number; classification_fingerprint: string }>();
    for (const source of products) {
      const record = projection(source, stateFor(store.settings, source.id), store.database_now);
      if (!record.ready || source.status !== "published" || !source.variants.length) throw conflict();
      if (!ids.has(source.id)) throw conflict();
      const latest = record.state!.history.at(-1)!;
      reviewed.set(source.id, { tax_code: latest.code.id, classification_revision: latest.revision, classification_fingerprint: taxClassificationReviewFingerprint(source.id, latest) });
    }
    return lines.map(line => ({ id: line.id, variant_id: line.variant_id!, product_id: line.product_id!, ...reviewed.get(line.product_id!)! }));
  } catch { throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Every product needs a current tax classification review before payment."); }
}
