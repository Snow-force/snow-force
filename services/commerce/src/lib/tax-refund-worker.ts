import type { MedusaContainer } from "@medusajs/framework/types";
import type { AuthContext } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import Stripe from "stripe";
import { z } from "zod";
import type { TaxQuoteConnection } from "./tax-quote-ledger";
import { assertTaxRefundReversal, assertTaxRefundReversalHeader, taxReversalLineSchema, TaxRefundConflict } from "./tax-refund-contract";
import { inspectTaxRefundFunds, readRefundReservation, type TaxRefundFundsReader } from "./tax-refund-funds";
import { stripeRefundId } from "./tax-refund-funds-contract";
import { assertTaxRefundLease, claimTaxRefund, claimTaxRefundReconciliation, completeTaxRefund, deferTaxRefund, enqueueTaxRefund, rememberTaxRefundId, type TaxRefundTask } from "./tax-refund-ledger";
import { saleTransactionId, taxSaleFingerprint, TaxSaleConflict } from "./tax-sale-contract";

export type TaxRefundProvider = TaxRefundFundsReader & {
  create(request: Stripe.Tax.TransactionCreateReversalParams, key: string): Promise<unknown>;
  retrieve(id: string): Promise<unknown>; lines(id: string, cursor?: string): Promise<unknown>;
};
type Client = Pick<Stripe, "accounts" | "paymentIntents" | "refunds" | "tax">;
export function createTaxRefundProvider(client?: Client, livemode?: boolean): TaxRefundProvider {
  if (!client) {
    const key = process.env.COMMERCE_STRIPE_API_KEY;
    if (!key || !/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(key)) throw new Error("Shop Stripe configuration unavailable.");
    client = new Stripe(key, { apiVersion: "2026-09-30.endive", timeout: 15000, maxNetworkRetries: 1 }); livemode = /^(sk|rk)_live_/.test(key);
  }
  if (typeof livemode !== "boolean") throw new TaxRefundConflict();
  const api = client;
  return { livemode, account: () => api.accounts.retrieveCurrent(), intent: id => api.paymentIntents.retrieve(z.string().regex(/^pi_[A-Za-z0-9]+$/).parse(id)),
    refund: id => api.refunds.retrieve(stripeRefundId.parse(id)),
    create: (request, key) => {
      const id = z.uuid().parse(key.slice("snowforce-tax-refund:".length));
      if (key !== `snowforce-tax-refund:${id}` || request.mode !== "partial" || request.metadata?.snowforce_operation !== id) throw new TaxRefundConflict();
      saleTransactionId.parse(request.original_transaction);
      return api.tax.transactions.createReversal(request, { idempotencyKey: key });
    },
    retrieve: id => api.tax.transactions.retrieve(saleTransactionId.parse(id)),
    lines: (id, cursor) => api.tax.transactions.listLineItems(saleTransactionId.parse(id), { limit: 100, ...(cursor ? { starting_after: cursor } : {}) }),
  };
}
const dbFor = (scope: MedusaContainer) => scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION);
/** Internal command only: the future initiating route must authenticate staff.
 * Reads succeeded funds from the provider; does not create a customer refund. */
export async function enqueueSucceededTaxRefund(scope: MedusaContainer, id: unknown, nativeId: unknown, remoteId: unknown, provider?: TaxRefundFundsReader) {
  const proof = await inspectTaxRefundFunds(scope, id, nativeId, remoteId, provider);
  return enqueueTaxRefund(dbFor(scope), await readRefundReservation(dbFor(scope), id), proof);
}
export async function collectTaxRefundReversal(task: TaxRefundTask, provider: TaxRefundProvider, id: string) {
  const raw = await provider.retrieve(saleTransactionId.parse(id));
  if (checkedHeader(task, raw).id !== id) throw new TaxRefundConflict();
  const all: z.infer<typeof taxReversalLineSchema>[] = [], seen = new Set<string>(); let cursor: string | undefined;
  for (let page = 0; page < 2; page++) {
    const result = z.object({ object: z.literal("list"), has_more: z.boolean(), data: z.array(taxReversalLineSchema).max(100) }).parse(await provider.lines(id, cursor));
    for (const line of result.data) { if (seen.has(line.id)) throw new TaxRefundConflict(); seen.add(line.id); all.push(line); }
    if (all.length > 100 || result.has_more && !result.data.length) throw new TaxRefundConflict();
    if (!result.has_more) return assertTaxRefundReversal(task.reservation.source_data.sale, task.reservation.allocation, raw, all);
    cursor = result.data.at(-1)!.id;
  }
  throw new TaxRefundConflict();
}
function checkedHeader(task: TaxRefundTask, raw: unknown) {
  const header = assertTaxRefundReversalHeader(task.reservation.source_data.sale, task.reservation.allocation, raw);
  if (header.created < task.funds.refund.created || header.posted_at < task.funds.refund.created) throw new TaxRefundConflict();
  return header;
}
async function assertCurrentFunds(scope: MedusaContainer, task: TaxRefundTask, provider: TaxRefundProvider) {
  const current = await inspectTaxRefundFunds(scope, task.id, task.funds.native_refund_id, task.funds.stripe_refund_id, provider);
  if (taxSaleFingerprint({ ...current, observed_at: task.funds.observed_at }) !== task.funds_fingerprint) throw new TaxRefundConflict();
}
async function runClaim(scope: MedusaContainer, task: TaxRefundTask, provider: TaxRefundProvider, suppliedId?: string, staffId?: string) {
  const db = dbFor(scope); let phase: "funds_changed" | "reversal_mismatch" = "funds_changed";
  try {
    await assertCurrentFunds(scope, task, provider);
    let id = suppliedId ?? task.remote_id;
    if (suppliedId && task.remote_id && suppliedId !== task.remote_id) throw new TaxRefundConflict();
    if (!id) {
      await assertTaxRefundLease(db, task, true);
      const raw = await provider.create(task.request, `snowforce-tax-refund:${task.id}`);
      phase = "reversal_mismatch";
      id = checkedHeader(task, raw).id;
      await rememberTaxRefundId(db, task, id);
    }
    phase = "reversal_mismatch";
    await assertTaxRefundLease(db, task);
    const result = await collectTaxRefundReversal(task, provider, id);
    phase = "funds_changed"; await assertCurrentFunds(scope, task, provider);
    phase = "reversal_mismatch";
    await rememberTaxRefundId(db, task, id);
    await completeTaxRefund(db, task, result, suppliedId ? { source: "staff_reconciliation", staff_id: staffId, transaction_id: id } : null);
    return { status: "ready" as const, id: task.id, transaction_id: id };
  } catch (error) {
    const code = error instanceof TaxRefundConflict || error instanceof TaxSaleConflict || error instanceof z.ZodError || error instanceof Stripe.errors.StripeInvalidRequestError || error instanceof Stripe.errors.StripeIdempotencyError ? phase : "provider_unavailable";
    await deferTaxRefund(db, task, code, Boolean(suppliedId));
    return { status: code === "provider_unavailable" && !suppliedId ? "retry" as const : "reconcile_required" as const, id: task.id };
  }
}
export async function processTaxRefund(scope: MedusaContainer, provider?: TaxRefundProvider) {
  const task = await claimTaxRefund(dbFor(scope)); if (!task) return null;
  let client: TaxRefundProvider;
  try { client = provider ?? createTaxRefundProvider(); }
  catch { await deferTaxRefund(dbFor(scope), task, "provider_unavailable"); return { status: "retry" as const, id: task.id }; }
  return runClaim(scope, task, client);
}
export async function reconcileTaxRefund(scope: MedusaContainer, auth: AuthContext | undefined, rawId: unknown, rawBody: unknown, provider?: TaxRefundProvider) {
  if (auth?.actor_type !== "user" || !/^user_[A-Za-z0-9]+$/.test(auth.actor_id)) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in to the shop admin.");
  const id = z.uuid().parse(rawId), body = z.object({ transaction_id: saleTransactionId }).strict().parse(rawBody), task = await claimTaxRefundReconciliation(dbFor(scope), id);
  let client: TaxRefundProvider;
  try { client = provider ?? createTaxRefundProvider(); }
  catch { await deferTaxRefund(dbFor(scope), task, "provider_unavailable", true); return { status: "reconcile_required" as const, id }; }
  return runClaim(scope, task, client, body.transaction_id, auth.actor_id);
}
