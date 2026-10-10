import { randomUUID } from "node:crypto";
import type { AuthContext } from "@medusajs/framework/http";
import type { MedusaContainer, IOrderModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { refundPaymentWorkflow } from "@medusajs/medusa/core-flows";
import Stripe from "stripe";
import { z } from "zod";
import type { TaxQuoteConnection } from "./tax-quote-ledger";
import { readNativeTaxRefund, readRefundReservation, type TaxRefundFundsReader } from "./tax-refund-funds";
import { verifiedStripeRefundSchema } from "./tax-refund-funds-contract";
import { checkedTaxRefundReservation, startTaxRefundReservation, recheckRefundExecutionApproval } from "./tax-refund-reservations";
import { checkedRefundSale, TaxRefundConflict } from "./tax-refund-contract";
import { assertTaxSaleFunds } from "./tax-sale-worker";
import { TaxSaleConflict, taxSaleFingerprint } from "./tax-sale-contract";
import { enqueueSucceededTaxRefund } from "./tax-refund-worker";
import { paymentAdminActor } from "./payment-operations";
import { assertSalesOperations } from "./operating-mode";
import { exactTaxUsdCents } from "./tax-quote-money";
import { requireConfiguredRefundAdapter } from "./refund-runtime";

const refundSchema = verifiedStripeRefundSchema.extend({ status: z.enum(["pending", "requires_action", "succeeded", "failed", "canceled"]) });
const requestSchema = z.object({ payment_intent: z.string().regex(/^pi_[A-Za-z0-9]+$/).max(120), amount: z.number().int().positive().max(99_999_999), currency: z.literal("usd"),
  metadata: z.object({ snowforce_operation: z.uuid(), snowforce_allocation: z.string().regex(/^[a-f0-9]{64}$/), snowforce_order: z.string().regex(/^order_[A-Za-z0-9]+$/), snowforce_payment: z.string().regex(/^pay_[A-Za-z0-9]+$/) }).strict() }).strict();
type Reservation = ReturnType<typeof checkedTaxRefundReservation>;
export function cashRefundRequest(raw: unknown) {
  const a = checkedTaxRefundReservation(raw), sale = checkedRefundSale(a.source_data.sale);
  return requestSchema.parse({ payment_intent: sale.source.intent_id, amount: a.total_cents, currency: "usd",
    metadata: { snowforce_operation: a.id, snowforce_allocation: a.allocation_fingerprint, snowforce_order: a.order_id, snowforce_payment: a.payment_id } });
}
const taskSchema = z.object({ id: z.uuid(), state: z.enum(["queued", "running", "retry", "pending", "reconcile_required", "ready"]),
  request: requestSchema, request_fingerprint: z.string(), reservation: z.unknown(), remote_id: z.string().regex(/^re_[A-Za-z0-9]+$/).nullable(),
  snapshot: refundSchema.nullable(), attempts: z.coerce.number().int().nonnegative(), claim_token: z.uuid().nullable(),
  first_attempt_at: z.coerce.number().int().positive().nullable(), lease_until: z.coerce.number().int().positive().nullable(), database_now: z.coerce.number().int().positive() });
export function checkedRefundExecution(raw: unknown) {
  const task = taskSchema.parse(raw), a = checkedTaxRefundReservation(task.reservation), request = cashRefundRequest(a);
  if (task.id !== a.id || a.state !== "started" || taxSaleFingerprint(request) !== task.request_fingerprint || taxSaleFingerprint(task.request) !== task.request_fingerprint ||
    task.snapshot && (task.remote_id !== task.snapshot.id || !matchesRefund(a, task.snapshot))) throw new TaxRefundConflict();
  return { ...task, reservation: a };
}
type Task = ReturnType<typeof checkedRefundExecution>;
export type RefundExecutorProvider = TaxRefundFundsReader & {
  createRefund(request: z.infer<typeof requestSchema>, key: string): Promise<unknown>;
  listRefunds(intent: string, cursor?: string): Promise<unknown>;
};
export function createRefundExecutorProvider(injected?: Stripe, injectedLivemode?: boolean): RefundExecutorProvider {
  const key = process.env.COMMERCE_STRIPE_API_KEY;
  if (injected ? typeof injectedLivemode !== "boolean" : !key || !/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(key)) throw new Error("Shop Stripe configuration unavailable.");
  const api = injected ?? new Stripe(key!, { apiVersion: "2026-09-30.endive", timeout: 15000, maxNetworkRetries: 1 });
  const intentId = (id: string) => z.string().regex(/^pi_[A-Za-z0-9]+$/).max(120).parse(id);
  const refundId = (id: string) => z.string().regex(/^re_[A-Za-z0-9]+$/).max(120).parse(id);
  return { livemode: injected ? injectedLivemode! : /^(sk|rk)_live_/.test(key!), account: () => api.accounts.retrieveCurrent(), intent: id => api.paymentIntents.retrieve(intentId(id)), refund: id => api.refunds.retrieve(refundId(id)),
    listRefunds: (id, cursor) => api.refunds.list({ payment_intent: intentId(id), limit: 100, ...(cursor ? { starting_after: refundId(cursor) } : {}) }),
    createRefund: (request, idempotencyKey) => {
      const body = requestSchema.parse(request);
      if (idempotencyKey !== `snowforce-cash-refund:${body.metadata.snowforce_operation}`) throw new TaxRefundConflict();
      // Stripe derives refund currency from the original payment. Our saved
      // request still requires USD, but currency is not a Refund API field.
      return api.refunds.create({ payment_intent: body.payment_intent, amount: body.amount, metadata: body.metadata }, { idempotencyKey });
    } };
}
const dbFor = (scope: MedusaContainer) => scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION);
const fields = `e.id,e.state,e.request,e.request_fingerprint,e.remote_id,e.snapshot,e.attempts,e.claim_token,
  floor(extract(epoch from e.first_attempt_at)*1000)::bigint as first_attempt_at,floor(extract(epoch from e.lease_until)*1000)::bigint as lease_until,
  floor(extract(epoch from clock_timestamp())*1000)::bigint as database_now,
  to_jsonb(a)||jsonb_build_object('first_attempt_at',floor(extract(epoch from a.first_attempt_at)),'cancelled_at',floor(extract(epoch from a.cancelled_at))) as reservation`;
const from = "commerce.snowforce_refund_executions e join commerce.snowforce_refund_allocations a on a.id=e.id";
const one = (rows: unknown[]) => checkedRefundExecution(z.array(z.unknown()).length(1).parse(rows)[0]);
const fence = "id=? and state='running' and claim_token=?::uuid and lease_until>clock_timestamp()";
function matchesRefund(a: Reservation, refund: z.infer<typeof refundSchema>) {
  const request = cashRefundRequest(a);
  return refund.amount === request.amount && refund.payment_intent === request.payment_intent && refund.created >= a.first_attempt_at! &&
    Object.entries(request.metadata).every(([key, value]) => refund.metadata[key as keyof typeof refund.metadata] === value);
}
export async function queueRefundExecution(scope: MedusaContainer, auth: AuthContext | undefined, rawId: unknown, rawBody: unknown) {
  const staff = paymentAdminActor(auth), id = z.uuid().parse(rawId), body = z.object({ allocation_fingerprint: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }).strict().parse(rawBody);
  assertSalesOperations();
  const before = await readRefundReservation(dbFor(scope), id);
  if (before.staff_id !== staff || before.allocation_fingerprint !== body.allocation_fingerprint) throw new TaxRefundConflict();
  const a = await startTaxRefundReservation(scope, before.order_id, id, staff), request = cashRefundRequest(a);
  return dbFor(scope).transaction(async db => {
    await db.raw('select id from commerce."order" where id=? for update', [a.order_id]);
    await db.raw(`insert into commerce.snowforce_refund_executions(id,payment_id,request,request_fingerprint) values(?,?,?::jsonb,?) on conflict(id) do nothing`,
      [id, a.payment_id, JSON.stringify(request), taxSaleFingerprint(request)]);
    return safeRefundExecution(one((await db.raw(`select ${fields} from ${from} where e.id=?`, [id])).rows));
  });
}
export function safeRefundExecution(task: Task) {
  return { id: task.id, state: task.state, total_cents: task.reservation.total_cents, livemode: task.reservation.livemode, stripe_refund_id: task.remote_id, refund_status: task.snapshot?.status ?? null, attempts: task.attempts };
}
export async function claimRefundExecution(db: TaxQuoteConnection, rawId?: unknown) {
  const id = rawId === undefined ? undefined : z.uuid().parse(rawId);
  return db.transaction(async tx => {
    // Serialize claims on a payment, including separate operation IDs. Only the
    // oldest unfinished refund may proceed; a pending or uncertain one blocks later work.
    const candidate = (await tx.raw(`select ${fields} from ${from} where ${id ? "e.id=? and " : ""}
      ((e.state in ('queued','retry','pending') and e.next_attempt_at<=clock_timestamp()) or (e.state='running' and e.lease_until<=clock_timestamp()))
      and not exists(select 1 from commerce.snowforce_refund_executions x join commerce.snowforce_refund_allocations b on b.id=x.id
        where x.payment_id=e.payment_id and x.id<>e.id and x.state<>'ready' and b.sequence<a.sequence)
      order by a.sequence limit 1 for update of e skip locked`, id ? [id] : [])).rows;
    if (!candidate.length) return null;
    const old = one(candidate);
    await tx.raw(`select id from commerce.payment where id=? and deleted_at is null for update`, [old.reservation.payment_id]);
    // A concurrent claimant can have observed the candidate before the first
    // claim committed; SKIP LOCKED + locking the execution row fences that case.
    await tx.raw(`update commerce.snowforce_refund_executions set state='running',claim_token=?::uuid,lease_until=clock_timestamp()+interval '3 minutes',
      first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),attempts=attempts+1,error_code=null where id=?`, [randomUUID(), old.id]);
    return one((await tx.raw(`select ${fields} from ${from} where e.id=?`, [old.id])).rows);
  });
}
async function assertLease(db: TaxQuoteConnection, task: Task, posting = false) {
  const current = one((await db.raw(`select ${fields} from ${from} where e.id=? and e.state='running' and e.claim_token=?::uuid and e.lease_until>clock_timestamp()`, [task.id, task.claim_token!])).rows);
  if (!current.lease_until || current.lease_until - current.database_now < 60000 ||
    posting && (current.remote_id || !current.first_attempt_at || current.database_now < current.first_attempt_at || current.database_now-current.first_attempt_at>=22*3600000)) throw new TaxRefundConflict();
  return current;
}
async function saveRemote(db: TaxQuoteConnection, task: Task, raw: unknown) {
  const remote = refundSchema.parse(raw);
  const now=z.array(z.object({now:z.coerce.number().int().positive()})).length(1).parse((await db.raw("select floor(extract(epoch from clock_timestamp())*1000)::bigint as now")).rows)[0].now;
  if (!matchesRefund(task.reservation, remote) || remote.created*1000 > now+3000) throw new TaxRefundConflict();
  if ((await db.raw(`update commerce.snowforce_refund_executions set remote_id=?,snapshot=?::jsonb where ${fence} and (remote_id is null or remote_id=?) returning id`,
    [remote.id, JSON.stringify(remote), task.id, task.claim_token!, remote.id])).rows.length !== 1) throw new TaxRefundConflict();
  return remote;
}
async function finish(db: TaxQuoteConnection, task: Task, state: "ready"|"pending"|"retry"|"reconcile_required", code: string|null) {
  if ((await db.raw(`update commerce.snowforce_refund_executions set state=?,error_code=nullif(?,''),next_attempt_at=clock_timestamp()+interval '2 minutes',claim_token=null,lease_until=null where ${fence} returning id`,
    [state, code ?? "", task.id, task.claim_token!])).rows.length !== 1) throw new TaxRefundConflict();
}
async function remoteHistory(db: TaxQuoteConnection, task: Task, api: RefundExecutorProvider) {
  const sale = checkedRefundSale(task.reservation.source_data.sale);
  await assertTaxSaleFunds(sale.source, api);
  // Re-read native payment facts under its native refund lock, then release it
  // before doing network I/O. Any untracked native refund blocks execution.
  await db.transaction(async tx => {
    const rows = (await tx.raw(`select id from commerce.payment where id=? and provider_id='pp_stripe_stripe' and currency_code='usd'
      and deleted_at is null and canceled_at is null and amount*100=? and amount=(raw_amount->>'value')::numeric and data->>'id'=? for update`,
      [sale.source.payment_id, sale.quote.amounts.total_cents, sale.source.intent_id])).rows;
    if (rows.length!==1 || (await tx.raw(`select r.id from commerce.refund r left join commerce.snowforce_refund_funds f on f.native_refund_id=r.id
      where r.payment_id=? and r.deleted_at is null and f.allocation_id is null and r.metadata->'snowforce_refund'->>'operation_id' is distinct from ?`, [sale.source.payment_id, task.id])).rows.length) throw new TaxRefundConflict();
    const captures=z.array(z.object({id:z.string(),amount:z.unknown(),raw_amount:z.object({value:z.unknown()}),created_at:z.coerce.number().int()})).parse((await tx.raw(
      "select id,amount,raw_amount,floor(extract(epoch from created_at))::bigint as created_at from commerce.capture where payment_id=? and deleted_at is null",[sale.source.payment_id])).rows);
    if(captures.length!==1||captures[0].id!==sale.source.capture_id||captures[0].created_at!==sale.source.captured_at||
      exactTaxUsdCents(captures[0].amount)!==sale.quote.amounts.total_cents||exactTaxUsdCents(captures[0].raw_amount.value)!==sale.quote.amounts.total_cents)throw new TaxRefundConflict();
  });
  const tracked = z.array(z.object({ stripe_refund_id: z.string(), total_cents: z.coerce.number().int().positive() })).parse((await db.raw(
    "select stripe_refund_id,total_cents from commerce.snowforce_refund_funds where payment_id=?", [sale.source.payment_id])).rows);
  const seen = new Set<string>(), previous = new Set<string>(); let cursor: string|undefined, own: z.infer<typeof refundSchema>|undefined;
  for (let page=0;page<20;page++) {
    const result=z.object({has_more:z.boolean(),data:z.array(z.object({id:z.string(),amount:z.number().int().positive(),status:z.string(),payment_intent:z.union([z.string(),z.object({id:z.string()})]).transform(x=>typeof x==="string"?x:x.id),metadata:z.record(z.string(),z.string())}).passthrough()).max(100)}).parse(await api.listRefunds(sale.source.intent_id,cursor));
    for(const raw of result.data) {
      if(seen.has(raw.id)||raw.payment_intent!==sale.source.intent_id)throw new TaxRefundConflict(); seen.add(raw.id);
      if(raw.metadata.snowforce_operation===task.id) { if(own)throw new TaxRefundConflict(); own=refundSchema.parse(raw); if(!matchesRefund(task.reservation,own))throw new TaxRefundConflict(); }
      else { const match=tracked.find(f=>f.stripe_refund_id===raw.id); if(!match||match.total_cents!==raw.amount||raw.status!=="succeeded")throw new TaxRefundConflict(); previous.add(raw.id); }
    }
    if(!result.has_more) { if(previous.size!==tracked.filter(f=>f.stripe_refund_id!==own?.id).length)throw new TaxRefundConflict();return own; }
    if(!result.data.length)throw new TaxRefundConflict();cursor=result.data.at(-1)!.id;
  }
  throw new TaxRefundConflict();
}
type Book = (scope: MedusaContainer, task: Task) => Promise<string>;
/** Native provider only verifies an already-successful Stripe refund. It must
 * never create funds itself, including native workflow retries/compensations. */
export async function nativeRefundBookkeeping(scope: MedusaContainer, task: Task) {
  const db=dbFor(scope), a=task.reservation;
  const current=await assertLease(db,task);
  if(current.snapshot?.status!=="succeeded"||!current.remote_id)throw new TaxRefundConflict();
  let rows=(await db.raw("select id from commerce.refund where payment_id=? and deleted_at is null and metadata->'snowforce_refund'->>'operation_id'=?",[a.payment_id,a.id])).rows;
  if(!rows.length) {
    const input={payment_id:a.payment_id,amount:(a.total_cents/100).toFixed(2),created_by:a.staff_id,note:"Reviewed original-price return refund",
      metadata:{snowforce_refund:{operation_id:a.id,allocation_fingerprint:a.allocation_fingerprint,claim_token:task.claim_token}}};
    await refundPaymentWorkflow(scope).run({input,context:{transactionId:`snowforce-refund-book:${a.id}`}});
    rows=(await db.raw("select id from commerce.refund where payment_id=? and deleted_at is null and metadata->'snowforce_refund'->>'operation_id'=?",[a.payment_id,a.id])).rows;
  }
  const id=z.array(z.object({id:z.string().regex(/^ref_[A-Za-z0-9]+$/)})).length(1).parse(rows)[0].id;
  // Recovery must validate the current native record before adding an order
  // debit, even if a previous workflow stopped after creating that record.
  await readNativeTaxRefund(db,a,id);
  await assertLease(db,task);
  const transactions=(await db.raw("select amount,raw_amount,currency_code from commerce.order_transaction where order_id=? and reference='refund' and reference_id=? and deleted_at is null",[a.order_id,id])).rows;
  if(!transactions.length)await scope.resolve<IOrderModuleService>(Modules.ORDER).addOrderTransactions({order_id:a.order_id,amount:-(a.total_cents/100),currency_code:"usd",reference:"refund",reference_id:id});
  else {const values=z.array(z.object({amount:z.unknown(),raw_amount:z.object({value:z.unknown()}),currency_code:z.literal("usd")})).length(1).parse(transactions);
    for(const amount of [values[0].amount,values[0].raw_amount.value]){
      const decimal=z.union([z.number().finite(),z.string().regex(/^-\d+(?:\.\d+)?$/)]).parse(amount);
      if(Number(decimal)>=0||exactTaxUsdCents(String(decimal).replace(/^-/,""))!==a.total_cents)throw new TaxRefundConflict();
    }
  }
  return id;
}
export async function processRefundExecution(scope: MedusaContainer, api?: RefundExecutorProvider, book: Book=nativeRefundBookkeeping, id?: unknown) {
  // Isolated injected Sandbox verifiers retain their explicit bookkeeper.
  // Runtime dispatch requires the actual GET-only provider for this database
  // and key, before claiming a task or accessing Stripe.
  let provider: RefundExecutorProvider;
  if (api && book !== nativeRefundBookkeeping) {
    if (api.livemode) throw new TaxRefundConflict();
    provider = api;
  } else {
    const adapter = requireConfiguredRefundAdapter(scope);
    provider = api ?? createRefundExecutorProvider();
    if (provider.livemode !== adapter.livemode) throw new TaxRefundConflict();
  }
  const db=dbFor(scope), task=await claimRefundExecution(db,id);if(!task)return null;
  try {
    const own=await remoteHistory(db,task,provider);
    let raw:unknown;
    if(task.remote_id)raw=await provider.refund(task.remote_id);
    else if(own)raw=await provider.refund(own.id);
    else { await recheckRefundExecutionApproval(scope,task.id);await assertLease(db,task,true);raw=await provider.createRefund(task.request,`snowforce-cash-refund:${task.id}`); }
    const remote=await saveRemote(db,task,raw);
    if(remote.status!=="succeeded") {const state=["pending","requires_action"].includes(remote.status)?"pending":"reconcile_required";await finish(db,task,state,"refund_not_succeeded");return {id:task.id,status:state};}
    await assertLease(db,task);
    const native=await book(scope,task);
    await enqueueSucceededTaxRefund(scope,task.id,native,remote.id,provider);
    await finish(db,task,"ready",null);return {id:task.id,status:"ready"};
  }catch(error) {
    const manual=error instanceof TaxRefundConflict||error instanceof TaxSaleConflict||error instanceof z.ZodError||error instanceof Stripe.errors.StripeInvalidRequestError||error instanceof Stripe.errors.StripeIdempotencyError;
    await finish(db,task,manual?"reconcile_required":"retry",manual?"evidence_changed":"provider_unavailable");return {id:task.id,status:manual?"reconcile_required":"retry"};
  }
}
