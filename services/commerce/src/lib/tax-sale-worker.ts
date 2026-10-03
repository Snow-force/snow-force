import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { AuthContext } from "@medusajs/framework/http";
import Stripe from "stripe";
import { z } from "zod";
import type { TaxQuoteConnection } from "./tax-quote-ledger";
import { assertTaxSaleHeader, assertTaxSaleTransaction, checkedTaxSaleSource, saleOrderId, saleTransactionId, TaxSaleConflict, taxSaleAdminSchema, taxSaleFingerprint, taxSaleLineSchema, type TaxSaleSource } from "./tax-sale-contract";
import { assertTaxSaleLease, claimTaxSale, claimTaxSaleReconciliation, completeTaxSale, deferTaxSale, rememberTaxSaleId, reserveTaxSale, type TaxSaleTask } from "./tax-sale-ledger";
import { readCapturedTaxSale } from "./tax-sale-source";

export type TaxSaleProvider = {
  livemode: boolean; account(): Promise<unknown>; intent(id: string): Promise<unknown>;
  create(request: Stripe.Tax.TransactionCreateFromCalculationParams, key: string): Promise<unknown>;
  retrieve(id: string): Promise<unknown>; lines(id: string, cursor?: string): Promise<unknown>;
};
export function createTaxSaleProvider(): TaxSaleProvider {
  const key = process.env.COMMERCE_STRIPE_API_KEY;
  if (!key || !/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(key)) throw new Error("Shop Stripe configuration unavailable.");
  const client = new Stripe(key, { apiVersion: "2026-09-30.endive", timeout: 15000, maxNetworkRetries: 1 });
  return { livemode: /^(sk|rk)_live_/.test(key), account: () => client.accounts.retrieveCurrent(), intent: id => client.paymentIntents.retrieve(id),
    create: (request, idempotencyKey) => client.tax.transactions.createFromCalculation(request, { idempotencyKey }),
    retrieve: id => client.tax.transactions.retrieve(saleTransactionId.parse(id)), lines: (id, cursor) => client.tax.transactions.listLineItems(saleTransactionId.parse(id), { limit: 100, ...(cursor ? { starting_after: cursor } : {}) }),
  };
}
export async function assertTaxSaleFunds(source: TaxSaleSource, provider: TaxSaleProvider) {
  const { quote } = checkedTaxSaleSource(source);
  const [account, rawIntent] = await Promise.all([provider.account(), provider.intent(source.intent_id)]);
  const accountId = z.object({ id: z.string().regex(/^acct_[A-Za-z0-9]+$/) }).parse(account).id;
  const intent = z.object({ id: z.literal(source.intent_id), object: z.literal("payment_intent"), currency: z.literal("usd"), status: z.literal("succeeded"), livemode: z.boolean(),
    amount: z.literal(quote.amounts.total_cents), amount_received: z.literal(quote.amounts.total_cents), amount_capturable: z.literal(0), metadata: z.object({ session_id: z.literal(source.session_id) }),
  }).parse(rawIntent);
  if (accountId !== source.input.account_id || intent.livemode !== source.input.livemode || provider.livemode !== source.input.livemode) throw new TaxSaleConflict();
}
export async function collectTaxSaleTransaction(task: TaxSaleTask, provider: TaxSaleProvider, id: string) {
  const raw = await provider.retrieve(id), transaction = assertTaxSaleHeader(task.source, task.id, raw);
  if (transaction.id !== id) throw new TaxSaleConflict();
  const all: z.infer<typeof taxSaleLineSchema>[] = [], seen = new Set<string>(); let cursor: string | undefined;
  for (let page = 0; page < 2; page++) {
    const result = z.object({ object: z.literal("list"), has_more: z.boolean(), data: z.array(taxSaleLineSchema).max(100) }).parse(await provider.lines(id, cursor));
    for (const line of result.data) { if (seen.has(line.id)) throw new TaxSaleConflict(); seen.add(line.id); all.push(line); }
    if (all.length > 100 || result.has_more && !result.data.length) throw new TaxSaleConflict();
    if (!result.has_more) return assertTaxSaleTransaction(task.source, task.id, raw, all);
    cursor = result.data.at(-1)!.id;
  }
  throw new TaxSaleConflict();
}
type SourceReader = (scope: MedusaContainer, id: string) => Promise<TaxSaleSource>;
const dbFor = (scope: MedusaContainer) => scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION);
export async function enqueueCapturedTaxSale(scope: MedusaContainer, orderId: string, read: SourceReader = readCapturedTaxSale) {
  return reserveTaxSale(dbFor(scope), await read(scope, saleOrderId.parse(orderId)));
}
async function runClaim(scope: MedusaContainer, task: TaxSaleTask, provider: TaxSaleProvider, read: SourceReader, suppliedId?: string, staffId?: string) {
  const db = dbFor(scope); let phase: "evidence_changed" | "transaction_mismatch" | "provider_unavailable" = "evidence_changed";
  try {
    if (taxSaleFingerprint(await read(scope, task.source.order_id)) !== task.source_fingerprint) throw new TaxSaleConflict();
    phase = "provider_unavailable";
    await assertTaxSaleFunds(task.source, provider);
    let id = suppliedId ?? task.remote_id;
    if (suppliedId && task.remote_id && suppliedId !== task.remote_id) throw new TaxSaleConflict();
    if (!id) {
      await assertTaxSaleLease(db, task, true);
      const raw = await provider.create(task.request, `snowforce-tax-sale:${task.id}`);
      phase = "transaction_mismatch";
      id = assertTaxSaleHeader(task.source, task.id, raw).id;
      await rememberTaxSaleId(db, task, id);
    }
    phase = "provider_unavailable";
    await assertTaxSaleLease(db, task);
    const result = await collectTaxSaleTransaction(task, provider, id);
    phase = "evidence_changed";
    if (taxSaleFingerprint(await read(scope, task.source.order_id)) !== task.source_fingerprint) throw new TaxSaleConflict();
    phase = "transaction_mismatch";
    await rememberTaxSaleId(db, task, id);
    await completeTaxSale(db, task, result, suppliedId ? { source: "staff_reconciliation", staff_id: staffId, transaction_id: id } : null);
    return { status: "ready" as const, id: task.id, transaction_id: id };
  } catch (error) {
    // Zod errors on provider data are evidence failures, never permission to submit another sale.
    const code = error instanceof TaxSaleConflict || error instanceof z.ZodError || error instanceof Stripe.errors.StripeInvalidRequestError || error instanceof Stripe.errors.StripeIdempotencyError ? phase === "evidence_changed" ? "evidence_changed" : "transaction_mismatch" : "provider_unavailable";
    await deferTaxSale(db, task, code, Boolean(suppliedId));
    return { status: code === "provider_unavailable" && !suppliedId ? "retry" as const : "reconcile_required" as const, id: task.id };
  }
}
export async function processTaxSale(scope: MedusaContainer, provider?: TaxSaleProvider, read: SourceReader = readCapturedTaxSale) {
  const task = await claimTaxSale(dbFor(scope));
  if (!task) return null;
  // Lazy construction: no Stripe API client or network call when the queue is empty.
  let client: TaxSaleProvider;
  try { client = provider ?? createTaxSaleProvider(); }
  catch { await deferTaxSale(dbFor(scope), task, "provider_unavailable"); return { status: "retry" as const, id: task.id }; }
  try { return await runClaim(scope, task, client, read); }
  catch (error) { if (error instanceof TaxSaleConflict) throw error; throw new Error("Sale tax task processing needs review."); }
}
function requireStaff(auth: AuthContext | undefined) {
  if (auth?.actor_type !== "user" || !/^user_[A-Za-z0-9]+$/.test(auth.actor_id)) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in to the shop admin.");
  return auth.actor_id;
}
export async function adminTaxSales(scope: MedusaContainer, auth: AuthContext | undefined) {
  requireStaff(auth);
  const result = await dbFor(scope).raw("select id,order_id,state,attempts,total_cents,livemode,remote_id as transaction_id,created_at::text,updated_at::text,error_code from commerce.snowforce_tax_sale_tasks order by created_at desc,id desc limit 100");
  return taxSaleAdminSchema.parse({ tasks: result.rows, unrecorded_orders: (await dbFor(scope).raw(discoverySql)).rows });
}
export async function reconcileTaxSale(scope: MedusaContainer, auth: AuthContext | undefined, rawId: unknown, body: unknown, provider?: TaxSaleProvider, read: SourceReader = readCapturedTaxSale) {
  const staffId = requireStaff(auth), id = z.uuid().parse(rawId), input = z.object({ transaction_id: saleTransactionId }).strict().parse(body);
  const task = await claimTaxSaleReconciliation(dbFor(scope), id);
  let client: TaxSaleProvider;
  try { client = provider ?? createTaxSaleProvider(); }
  catch { await deferTaxSale(dbFor(scope), task, "provider_unavailable", true); return { status: "reconcile_required" as const, id: task.id }; }
  return runClaim(scope, task, client, read, input.transaction_id, staffId);
}
/** Recover missed capture events by discovering original bound orders in the database. */
const discoverySql = `select distinct o.id as order_id from commerce."order" o join commerce.order_cart oc on oc.order_id=o.id and oc.deleted_at is null
    join commerce.snowforce_tax_quotes q on q.cart_id=oc.cart_id join commerce.snowforce_tax_quote_applications a on a.quote_id=q.id
    join commerce.payment p on p.payment_session_id=a.payment_session_id and p.deleted_at is null
    join commerce.capture c on c.payment_id=p.id and c.deleted_at is null
    where o.deleted_at is null and not exists(select 1 from commerce.snowforce_tax_sale_tasks t where t.order_id=o.id)
    order by o.id limit 20`;
export async function discoverTaxSales(scope: MedusaContainer, read: SourceReader = readCapturedTaxSale) {
  const rows = (await dbFor(scope).raw(discoverySql)).rows;
  const ids = z.array(z.object({ order_id: saleOrderId })).max(20).parse(rows);
  for (const { order_id } of ids) {
    try { await enqueueCapturedTaxSale(scope, order_id, read); }
    catch { scope.resolve(ContainerRegistrationKeys.LOGGER).error(`Sale tax evidence needs review for ${order_id}.`); }
  }
}
