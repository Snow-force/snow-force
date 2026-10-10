import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { TaxQuoteConnection } from "./tax-quote-ledger";
import { assertTaxRefundReversal, TaxRefundConflict } from "./tax-refund-contract";
import { checkedTaxRefundReservation } from "./tax-refund-reservations";
import { checkedTaxRefundFunds, readNativeTaxRefund, readRefundReservation } from "./tax-refund-funds";
import { saleTransactionId, taxSaleFingerprint } from "./tax-sale-contract";

const ms = z.coerce.number().int().positive().safe();
const taskSchema = z.object({ id: z.uuid(), reservation: z.unknown(), funds: z.unknown(), allocation_fingerprint: z.string(), funds_fingerprint: z.string(), request_fingerprint: z.string(),
  state: z.enum(["queued", "running", "retry", "reconcile_required", "ready"]), remote_id: saleTransactionId.nullable(), attempts: z.coerce.number().int().nonnegative(),
  claim_token: z.uuid().nullable(), lease_until: ms.nullable(), first_attempt_at: ms.nullable(), database_now: ms,
});
const fields = `t.id,t.allocation_fingerprint,t.funds_fingerprint,t.request_fingerprint,t.state,t.remote_id,t.attempts,t.claim_token,
  floor(extract(epoch from t.lease_until)*1000)::bigint as lease_until,floor(extract(epoch from t.first_attempt_at)*1000)::bigint as first_attempt_at,
  floor(extract(epoch from clock_timestamp())*1000)::bigint as database_now,
  to_jsonb(a)||jsonb_build_object('first_attempt_at',floor(extract(epoch from a.first_attempt_at)),'cancelled_at',floor(extract(epoch from a.cancelled_at))) as reservation,f.snapshot as funds`;
const from = "commerce.snowforce_refund_tax_tasks t join commerce.snowforce_refund_allocations a on a.id=t.id join commerce.snowforce_refund_funds f on f.allocation_id=t.id";
const fail = () => new TaxRefundConflict();
export function checkedTaxRefundTask(raw: unknown) {
  const task = taskSchema.parse(raw), reservation = checkedTaxRefundReservation(task.reservation), funds = checkedTaxRefundFunds(reservation, task.funds);
  if (task.id !== reservation.id || reservation.state !== "started" || task.allocation_fingerprint !== reservation.allocation_fingerprint ||
    task.funds_fingerprint !== taxSaleFingerprint(funds) || task.request_fingerprint !== reservation.request_fingerprint) throw fail();
  return { ...task, reservation, funds, request: reservation.request };
}
export type TaxRefundTask = ReturnType<typeof checkedTaxRefundTask>;
const oneTask = (rows: unknown[]) => checkedTaxRefundTask(z.array(z.unknown()).length(1).parse(rows)[0]);
/** Network proof is obtained first. This short transaction rechecks native
 * records under their payment lock and atomically saves funds and tax work. */
export async function enqueueTaxRefund(db: TaxQuoteConnection, rawReservation: unknown, rawProof: unknown) {
  const original = checkedTaxRefundReservation(rawReservation), proof = checkedTaxRefundFunds(original, rawProof);
  return db.transaction(async tx => {
    if ((await tx.raw('select id from commerce."order" where id=? and deleted_at is null for update', [original.order_id])).rows.length !== 1) throw fail();
    const reservation = await readRefundReservation(tx, original.id, true);
    if (taxSaleFingerprint(reservation) !== taxSaleFingerprint(original)) throw fail();
    const now = z.array(z.object({ database_now: ms })).length(1).parse((await tx.raw("select floor(extract(epoch from clock_timestamp())*1000)::bigint as database_now")).rows)[0].database_now;
    if (now < proof.observed_at * 1000 || now - proof.observed_at * 1000 > 120000) throw fail();
    if (taxSaleFingerprint(await readNativeTaxRefund(tx, reservation, proof.native_refund_id, true)) !== taxSaleFingerprint(proof.native)) throw fail();
    const existing = (await tx.raw(`select ${fields} from ${from} where t.id=?`, [reservation.id])).rows;
    if (existing.length) {
      const task = oneTask(existing);
      if (taxSaleFingerprint({ ...proof, observed_at: task.funds.observed_at }) !== task.funds_fingerprint) throw fail();
      return task;
    }
    await tx.raw(`insert into commerce.snowforce_refund_funds (allocation_id,native_refund_id,stripe_refund_id,account_id,livemode,payment_id,total_cents,snapshot,fingerprint)
      values (?,?,?,?,?,?,?,?::jsonb,?)`, [reservation.id, proof.native_refund_id, proof.stripe_refund_id, proof.account_id, proof.livemode, proof.payment_id, proof.total_cents, JSON.stringify(proof), taxSaleFingerprint(proof)]);
    await tx.raw(`insert into commerce.snowforce_refund_tax_tasks (id,allocation_fingerprint,funds_fingerprint,request_fingerprint) values (?,?,?,?)`,
      [reservation.id, reservation.allocation_fingerprint, taxSaleFingerprint(proof), reservation.request_fingerprint]);
    return oneTask((await tx.raw(`select ${fields} from ${from} where t.id=?`, [reservation.id])).rows);
  });
}
export async function claimTaxRefund(db: TaxQuoteConnection, rawId?: unknown) {
  const id = rawId === undefined ? undefined : z.uuid().parse(rawId);
  return db.transaction(async tx => {
    const result = await tx.raw(`select ${fields} from ${from} where ${id ? "t.id=? and " : ""}
      ((t.state in ('queued','retry') and t.next_attempt_at<=clock_timestamp()) or (t.state='running' and t.lease_until<=clock_timestamp()))
      order by t.next_attempt_at,t.created_at,t.id limit 1 for update of t skip locked`, id ? [id] : []);
    if (!result.rows.length) return null;
    const task = oneTask(result.rows);
    if (!task.remote_id && task.first_attempt_at !== null && (task.database_now < task.first_attempt_at || task.database_now - task.first_attempt_at >= 22 * 3600000)) {
      await tx.raw("update commerce.snowforce_refund_tax_tasks set state='reconcile_required',error_code='request_aged',claim_token=null,lease_until=null,updated_at=clock_timestamp() where id=?", [task.id]);
      return null;
    }
    await tx.raw(`update commerce.snowforce_refund_tax_tasks set state='running',claim_token=?::uuid,lease_until=clock_timestamp()+interval '3 minutes',
      first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),attempts=attempts+1,error_code=null,updated_at=clock_timestamp() where id=?`, [randomUUID(), task.id]);
    return oneTask((await tx.raw(`select ${fields} from ${from} where t.id=?`, [task.id])).rows);
  });
}
function token(task: TaxRefundTask) { if (task.state !== "running" || !task.claim_token) throw fail(); return task.claim_token; }
const fence = "id=? and state='running' and claim_token=?::uuid and lease_until>clock_timestamp()";
export async function assertTaxRefundLease(db: TaxQuoteConnection, task: TaxRefundTask, posting = false) {
  const current = oneTask((await db.raw(`select ${fields} from ${from} where t.id=? and t.state='running' and t.claim_token=?::uuid and t.lease_until>clock_timestamp()`, [task.id, token(task)])).rows);
  if (current.funds_fingerprint !== task.funds_fingerprint || current.allocation_fingerprint !== task.allocation_fingerprint || !current.lease_until || current.lease_until - current.database_now < 60000 ||
    posting && (current.remote_id || !current.first_attempt_at || current.database_now < current.first_attempt_at || current.database_now - current.first_attempt_at >= 22 * 3600000)) throw fail();
}
export async function rememberTaxRefundId(db: TaxQuoteConnection, task: TaxRefundTask, rawId: unknown) {
  const id = saleTransactionId.parse(rawId);
  if ((await db.raw(`update commerce.snowforce_refund_tax_tasks set remote_id=?,updated_at=clock_timestamp() where ${fence} and (remote_id is null or remote_id=?) returning id`, [id, task.id, token(task), id])).rows.length !== 1) throw fail();
}
export async function deferTaxRefund(db: TaxQuoteConnection, task: TaxRefundTask, code: "provider_unavailable" | "funds_changed" | "reversal_mismatch", readOnly = false) {
  const state = code === "provider_unavailable" && !readOnly ? "retry" : "reconcile_required", delay = Math.min(1800, 60 * 2 ** Math.min(task.attempts, 5));
  if ((await db.raw(`update commerce.snowforce_refund_tax_tasks set state=?,error_code=?,next_attempt_at=clock_timestamp()+?*interval '1 second',claim_token=null,lease_until=null,updated_at=clock_timestamp()
    where ${fence} returning id`, [state, code, delay, task.id, token(task)])).rows.length !== 1) throw fail();
}
export async function completeTaxRefund(db: TaxQuoteConnection, task: TaxRefundTask, rawResult: unknown, resolution: unknown = null) {
  const raw = z.object({ transaction: z.unknown(), lines: z.unknown() }).parse(rawResult), result = assertTaxRefundReversal(task.reservation.source_data.sale, task.reservation.allocation, raw.transaction, raw.lines);
  return db.transaction(async tx => {
    const current = oneTask((await tx.raw(`select ${fields} from ${from} where t.id=? and t.state='running' and t.claim_token=?::uuid and t.lease_until>clock_timestamp() for update of t`, [task.id, token(task)])).rows);
    if (current.remote_id !== result.transaction.id || current.funds_fingerprint !== task.funds_fingerprint || current.allocation_fingerprint !== task.allocation_fingerprint) throw fail();
    if (taxSaleFingerprint(await readNativeTaxRefund(tx, current.reservation, current.funds.native_refund_id, true)) !== taxSaleFingerprint(current.funds.native)) throw fail();
    await tx.raw(`insert into commerce.snowforce_refund_tax_results (task_id,account_id,livemode,transaction_id,snapshot,resolution) values (?,?,?,?,?::jsonb,?::jsonb)`,
      [task.id, current.reservation.account_id, current.reservation.livemode, result.transaction.id, JSON.stringify(result), JSON.stringify(resolution)]);
    if ((await tx.raw(`update commerce.snowforce_refund_tax_tasks set state='ready',error_code=null,claim_token=null,lease_until=null,updated_at=clock_timestamp() where ${fence} returning id`, [task.id, token(task)])).rows.length !== 1) throw fail();
  });
}
export async function claimTaxRefundReconciliation(db: TaxQuoteConnection, rawId: unknown) {
  const id = z.uuid().parse(rawId);
  return db.transaction(async tx => {
    const selected = await tx.raw(`select ${fields} from ${from} where t.id=? and t.state<>'ready' and (t.lease_until is null or t.lease_until<=clock_timestamp()) for update of t`, [id]);
    oneTask(selected.rows);
    await tx.raw(`update commerce.snowforce_refund_tax_tasks set state='running',claim_token=?::uuid,lease_until=clock_timestamp()+interval '3 minutes',
      first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),attempts=attempts+1,error_code=null,updated_at=clock_timestamp() where id=?`, [randomUUID(), id]);
    return oneTask((await tx.raw(`select ${fields} from ${from} where t.id=?`, [id])).rows);
  });
}
