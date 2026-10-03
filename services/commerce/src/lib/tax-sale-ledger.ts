import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { TaxQuoteConnection } from "./tax-quote-ledger";
import { checkedTaxSaleSource, saleTransactionId, taxSaleFingerprint, taxSaleRequest, TaxSaleConflict } from "./tax-sale-contract";

const ms = z.coerce.number().int().positive().safe();
const taskSchema = z.object({ id: z.uuid(), source: z.unknown(), source_fingerprint: z.string(), request: z.unknown(), request_fingerprint: z.string(),
  state: z.enum(["queued", "running", "retry", "reconcile_required", "ready"]), remote_id: saleTransactionId.nullable(),
  attempts: z.coerce.number().int().nonnegative(), claim_token: z.uuid().nullable(), lease_until: ms.nullable(), first_attempt_at: ms.nullable(), database_now: ms,
});
const fields = "id,source,source_fingerprint,request,request_fingerprint,state,remote_id,attempts,claim_token,floor(extract(epoch from lease_until)*1000)::bigint as lease_until,floor(extract(epoch from first_attempt_at)*1000)::bigint as first_attempt_at,floor(extract(epoch from clock_timestamp())*1000)::bigint as database_now";
export function checkedTaxSaleTask(raw: unknown) {
  const task = taskSchema.parse(raw), { source } = checkedTaxSaleSource(task.source);
  const request = taxSaleRequest(source, task.id);
  if (task.source_fingerprint !== taxSaleFingerprint(source) || task.request_fingerprint !== taxSaleFingerprint(request) || taxSaleFingerprint(task.request) !== taxSaleFingerprint(request)) throw new TaxSaleConflict();
  return { ...task, source, request };
}
/** Serializes on the native order; repeated events cannot reserve a second sale request. */
export async function reserveTaxSale(db: TaxQuoteConnection, rawSource: unknown) {
  const { source, quote } = checkedTaxSaleSource(rawSource);
  return db.transaction(async tx => {
    if ((await tx.raw('select id from commerce."order" where id=? and deleted_at is null for update', [source.order_id])).rows.length !== 1) throw new TaxSaleConflict();
    const previous = await tx.raw(`select ${fields} from commerce.snowforce_tax_sale_tasks where order_id=? for update`, [source.order_id]);
    if (previous.rows.length) {
      const task = checkedTaxSaleTask(z.array(z.unknown()).length(1).parse(previous.rows)[0]);
      if (task.source_fingerprint !== taxSaleFingerprint(source)) throw new TaxSaleConflict();
      return task;
    }
    const id = randomUUID(), request = taxSaleRequest(source, id);
    return checkedTaxSaleTask(z.array(z.unknown()).length(1).parse((await tx.raw(`insert into commerce.snowforce_tax_sale_tasks
      (id,order_id,quote_id,payment_id,capture_id,account_id,livemode,total_cents,source,source_fingerprint,request,request_fingerprint)
      values (?,?,?,?,?,?,?,?,?::jsonb,?,?::jsonb,?) returning ${fields}`, [id, source.order_id, source.quote_id, source.payment_id, source.capture_id, quote.account_id, quote.livemode,
      quote.amounts.total_cents, JSON.stringify(source), taxSaleFingerprint(source), JSON.stringify(request), taxSaleFingerprint(request)])).rows)[0]);
  });
}
export type TaxSaleTask = ReturnType<typeof checkedTaxSaleTask>;
/** A database fence survives process restarts and does not rely on the development event bus. */
export async function claimTaxSale(db: TaxQuoteConnection, taskId?: string) {
  if (taskId) z.uuid().parse(taskId);
  return db.transaction(async tx => {
    const result = await tx.raw(`select ${fields} from commerce.snowforce_tax_sale_tasks
      where ${taskId ? "id=? and " : ""} ((state in ('queued','retry') and next_attempt_at<=clock_timestamp()) or (state='running' and lease_until<=clock_timestamp()))
      order by next_attempt_at,created_at,id limit 1 for update skip locked`, taskId ? [taskId] : []);
    if (!result.rows.length) return null;
    const task = checkedTaxSaleTask(z.array(z.unknown()).length(1).parse(result.rows)[0]);
    if (!task.remote_id && task.first_attempt_at !== null && (task.database_now < task.first_attempt_at || task.database_now - task.first_attempt_at >= 22 * 3600 * 1000)) {
      await tx.raw("update commerce.snowforce_tax_sale_tasks set state='reconcile_required',error_code='request_aged',claim_token=null,lease_until=null,updated_at=clock_timestamp() where id=?", [task.id]);
      return null;
    }
    return checkedTaxSaleTask(z.array(z.unknown()).length(1).parse((await tx.raw(`update commerce.snowforce_tax_sale_tasks set state='running',claim_token=?::uuid,
      lease_until=clock_timestamp()+interval '3 minutes',first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),attempts=attempts+1,error_code=null,updated_at=clock_timestamp()
      where id=? returning ${fields}`, [randomUUID(), task.id])).rows)[0]);
  });
}
const fenced = "id=? and state='running' and claim_token=?::uuid and lease_until>clock_timestamp()";
function token(task: TaxSaleTask) { if (!task.claim_token || task.state !== "running") throw new TaxSaleConflict(); return task.claim_token; }
export async function assertTaxSaleLease(db: TaxQuoteConnection, task: TaxSaleTask, posting = false) {
  const current = checkedTaxSaleTask(z.array(z.unknown()).length(1).parse((await db.raw(`select ${fields} from commerce.snowforce_tax_sale_tasks where ${fenced}`, [task.id, token(task)])).rows)[0]);
  if (current.source_fingerprint !== task.source_fingerprint || !current.lease_until || current.lease_until - current.database_now < 60000 || posting &&
    (current.remote_id || !current.first_attempt_at || current.database_now < current.first_attempt_at || current.database_now - current.first_attempt_at >= 22 * 3600 * 1000)) throw new TaxSaleConflict();
}
export async function rememberTaxSaleId(db: TaxQuoteConnection, task: TaxSaleTask, rawId: unknown) {
  const id = saleTransactionId.parse(rawId);
  if ((await db.raw(`update commerce.snowforce_tax_sale_tasks set remote_id=?,updated_at=clock_timestamp() where ${fenced} and (remote_id is null or remote_id=?) returning id`, [id, task.id, token(task), id])).rows.length !== 1) throw new TaxSaleConflict();
}
export async function deferTaxSale(db: TaxQuoteConnection, task: TaxSaleTask, code: "provider_unavailable" | "evidence_changed" | "transaction_mismatch", readOnlyResolution = false) {
  const state = code === "provider_unavailable" && !readOnlyResolution ? "retry" : "reconcile_required", delay = Math.min(1800, 60 * 2 ** Math.min(task.attempts, 5));
  if ((await db.raw(`update commerce.snowforce_tax_sale_tasks set state=?,error_code=?,next_attempt_at=clock_timestamp()+?*interval '1 second',claim_token=null,lease_until=null,updated_at=clock_timestamp()
    where ${fenced} returning id`, [state, code, delay, task.id, token(task)])).rows.length !== 1) throw new TaxSaleConflict();
}
export async function completeTaxSale(db: TaxQuoteConnection, task: TaxSaleTask, result: { transaction: { id: string }; [key: string]: unknown }, resolution: unknown = null) {
  return db.transaction(async tx => {
    const current = checkedTaxSaleTask(z.array(z.unknown()).length(1).parse((await tx.raw(`select ${fields} from commerce.snowforce_tax_sale_tasks where ${fenced} for update`, [task.id, token(task)])).rows)[0]);
    if (current.source_fingerprint !== task.source_fingerprint || current.remote_id !== result.transaction.id) throw new TaxSaleConflict();
    await tx.raw(`insert into commerce.snowforce_tax_sales (task_id,order_id,quote_id,account_id,livemode,transaction_id,snapshot,resolution)
      values (?,?,?,?,?,?,?::jsonb,?::jsonb)`, [task.id, task.source.order_id, task.source.quote_id, task.source.input.account_id, task.source.input.livemode, result.transaction.id, JSON.stringify(result), JSON.stringify(resolution)]);
    if ((await tx.raw(`update commerce.snowforce_tax_sale_tasks set state='ready',error_code=null,claim_token=null,lease_until=null,updated_at=clock_timestamp() where ${fenced} returning id`, [task.id, token(task)])).rows.length !== 1) throw new TaxSaleConflict();
  });
}
/** Long-unknown creation is resolved by reading a staff-supplied remote ID, never another POST. */
export async function claimTaxSaleReconciliation(db: TaxQuoteConnection, rawId: unknown) {
  const id = z.uuid().parse(rawId);
  return db.transaction(async tx => {
    const selected = await tx.raw(`select ${fields} from commerce.snowforce_tax_sale_tasks where id=? and state<>'ready' and (lease_until is null or lease_until<=clock_timestamp()) for update`, [id]);
    if (selected.rows.length !== 1) throw new TaxSaleConflict();
    checkedTaxSaleTask(selected.rows[0]);
    return checkedTaxSaleTask(z.array(z.unknown()).length(1).parse((await tx.raw(`update commerce.snowforce_tax_sale_tasks set state='running',claim_token=?::uuid,
      lease_until=clock_timestamp()+interval '3 minutes',first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),attempts=attempts+1,error_code=null,updated_at=clock_timestamp() where id=? returning ${fields}`, [randomUUID(), id])).rows)[0]);
  });
}
