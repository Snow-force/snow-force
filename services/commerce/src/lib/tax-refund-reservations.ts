import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { z } from "zod";
import type { TaxQuoteConnection } from "./tax-quote-ledger";
import { saleOrderId, taxSaleFingerprint } from "./tax-sale-contract";
import { assertTaxRefundAllocation, bindRefundOrderLines, buildTaxRefundAllocation, checkedRefundSale, taxRefundInputSchema, taxRefundReversalRequest, TaxRefundConflict } from "./tax-refund-contract";
import { readTaxRefundSource } from "./tax-refund-source";
import { assertTrackedRefundBalance } from "./tracked-refund-balance";

const contextSchema = z.object({ case_id: z.uuid(), case_version: z.number().int().positive(),
  native_return_id: z.string().regex(/^return_[A-Za-z0-9]+$/), staff_id: z.string().regex(/^user_[A-Za-z0-9]+$/) }).strict();
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/), epoch = z.coerce.number().int().positive().safe();
const quantity = z.coerce.number().int().nonnegative().max(10000);
const reservationSchema = z.object({ id: z.uuid(), sequence: z.coerce.number().int().positive().safe(), order_id: saleOrderId,
  sale_task_id: z.uuid(), case_id: z.uuid(), case_version: z.number().int().positive(), native_return_id: z.string(), staff_id: z.string(),
  account_id: z.string(), livemode: z.boolean(), payment_id: z.string(), total_cents: z.number().int().positive(),
  input: taxRefundInputSchema, input_fingerprint: fingerprint, source_data: z.object({ sale: z.unknown(), order_lines: z.unknown() }).strict(),
  source_fingerprint: fingerprint, allocation: z.unknown(), allocation_fingerprint: fingerprint, request: z.unknown(), request_fingerprint: fingerprint,
  state: z.enum(["reserved", "started", "cancelled"]), first_attempt_at: epoch.nullable(), cancelled_at: epoch.nullable(), cancellation_reason: z.string().nullable(),
});
const fields = `id,sequence,order_id,sale_task_id,case_id,case_version,native_return_id,staff_id,account_id,livemode,payment_id,total_cents,
  input,input_fingerprint,source_data,source_fingerprint,allocation,allocation_fingerprint,request,request_fingerprint,state,
  floor(extract(epoch from first_attempt_at))::bigint as first_attempt_at,floor(extract(epoch from cancelled_at))::bigint as cancelled_at,cancellation_reason`;
const dbFor = (scope: MedusaContainer) => scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION);
const conflict = () => new TaxRefundConflict();
function normalizedInput(raw: unknown) {
  const input = taxRefundInputSchema.parse(raw);
  return { ...input, items: input.items.sort((a, b) => a.item_id.localeCompare(b.item_id)), fee_decisions: input.fee_decisions.sort((a, b) => a.state.localeCompare(b.state)) };
}
export function checkedTaxRefundReservation(raw: unknown) {
  const row = reservationSchema.parse(raw), sale = checkedRefundSale(row.source_data.sale);
  const bindings = bindRefundOrderLines(row.source_data.sale, row.source_data.order_lines), allocation = assertTaxRefundAllocation(row.source_data.sale, row.allocation);
  const request = taxRefundReversalRequest(row.source_data.sale, allocation);
  if (row.order_id !== sale.source.order_id || row.sale_task_id !== sale.operation_id || row.account_id !== sale.source.input.account_id ||
    row.livemode !== sale.source.input.livemode || row.payment_id !== sale.source.payment_id || row.id !== allocation.operation_id || row.total_cents !== allocation.total_cents ||
    row.input_fingerprint !== taxSaleFingerprint(normalizedInput(row.input)) || row.source_fingerprint !== taxSaleFingerprint(row.source_data) ||
    row.allocation_fingerprint !== taxSaleFingerprint(allocation) || row.request_fingerprint !== taxSaleFingerprint(request) || taxSaleFingerprint(row.request) !== row.request_fingerprint ||
    taxSaleFingerprint(normalizedInput(row.input).items) !== taxSaleFingerprint(allocation.lines.map(line => ({ item_id: line.item_id, quantity: line.quantity })).sort((a, b) => a.item_id.localeCompare(b.item_id))) ||
    row.input.refund_shipping !== allocation.refund_shipping || taxSaleFingerprint(normalizedInput(row.input).fee_decisions) !== taxSaleFingerprint([...allocation.fee_decisions].sort((a, b) => a.state.localeCompare(b.state))) ||
    allocation.lines.some(line => !bindings.some(binding => binding.item_id === line.item_id && binding.cart_line_id === line.cart_line_id)) ||
    (row.state === "reserved" && (row.first_attempt_at || row.cancelled_at || row.cancellation_reason)) ||
    (row.state === "started" && (!row.first_attempt_at || row.cancelled_at || row.cancellation_reason)) ||
    (row.state === "cancelled" && (row.first_attempt_at || !row.cancelled_at || !row.cancellation_reason))) throw conflict();
  return { ...row, allocation, request };
}
type SourceReader = typeof readTaxRefundSource;
async function lockOrder(db: TaxQuoteConnection, orderId: string) {
  if ((await db.raw('select id from commerce."order" where id=? and deleted_at is null and status<>\'canceled\' and currency_code=\'usd\' for update', [orderId])).rows.length !== 1) throw conflict();
}
async function staffExists(db: TaxQuoteConnection, staffId: string) {
  if ((await db.raw('select id from commerce."user" where id=? and deleted_at is null', [staffId])).rows.length !== 1) throw conflict();
}
async function readHistory(db: TaxQuoteConnection, orderId: string) {
  // Cancelled rows retain private audit evidence and must validate too, even
  // though their quantities no longer participate in the active prefix.
  return (await db.raw(`select ${fields} from commerce.snowforce_refund_allocations where order_id=? order by sequence`, [orderId])).rows
    .map(checkedTaxRefundReservation).filter(row => row.state !== "cancelled");
}
async function assertRefundPayment(db: TaxQuoteConnection, rawSale: unknown) {
  const sale = checkedRefundSale(rawSale);
  // Native refund creation locks its payment. Hold that same lock while
  // checking for untracked refunds and persisting/freezing a reservation.
  if ((await db.raw(`select id from commerce.payment where id=? and currency_code='usd' and provider_id='pp_stripe_stripe'
    and deleted_at is null and canceled_at is null and amount*100=? and amount=(raw_amount->>'value')::numeric for update`,
    [sale.source.payment_id, sale.quote.amounts.total_cents])).rows.length !== 1) throw conflict();
  await assertTrackedRefundBalance(db, rawSale, (await db.raw("select id from commerce.refund where payment_id=? and deleted_at is null order by id for update", [sale.source.payment_id])).rows);
}
async function assertReceipt(db: TaxQuoteConnection, orderId: string, context: z.infer<typeof contextSchema>, input: z.infer<typeof taxRefundInputSchema>, history: ReturnType<typeof checkedTaxRefundReservation>[]) {
  const row = z.array(z.object({ order_id: saleOrderId, kind: z.enum(["return", "exchange"]), status: z.literal("processing"), version: z.literal(context.case_version),
    native_id: z.string(), items: z.array(z.object({ id: z.string(), quantity: quantity })).min(1).max(100), created_at: z.coerce.date() })).length(1).parse((await db.raw(
    "select order_id,kind,status,version,native_id,items,created_at from commerce.snowforce_after_sales where id=? for update", [context.case_id])).rows)[0];
  const returned = z.array(z.object({ id: z.literal(context.native_return_id), order_id: saleOrderId, exchange_id: z.string().nullable(), claim_id: z.null(),
    canceled_at: z.null(), created_at: z.coerce.date(), status: z.string() })).length(1).parse((await db.raw(
    'select id,order_id,exchange_id,claim_id,canceled_at,created_at,status from commerce."return" where id=? and deleted_at is null for update', [context.native_return_id])).rows)[0];
  if (row.order_id !== orderId || returned.order_id !== orderId || returned.created_at < row.created_at || returned.status === "canceled" ||
    (row.kind === "return" ? row.native_id !== returned.id || returned.exchange_id !== null : row.native_id !== returned.exchange_id)) throw conflict();
  if (row.kind === "exchange" && (await db.raw('select id from commerce.order_exchange where id=? and order_id=? and return_id=? and canceled_at is null and deleted_at is null for update',
    [row.native_id, orderId, returned.id])).rows.length !== 1) throw conflict();
  const lines = z.array(z.object({ item_id: z.string(), quantity, raw_quantity: z.object({ value: quantity }), received_quantity: quantity, raw_received_quantity: z.object({ value: quantity }) })).min(1).max(100).parse((await db.raw(
    'select item_id,quantity,raw_quantity,received_quantity,raw_received_quantity from commerce.return_item where return_id=? and deleted_at is null order by item_id for update', [returned.id])).rows);
  if (new Set(row.items.map(line => line.id)).size !== row.items.length || new Set(lines.map(line => line.item_id)).size !== lines.length || row.items.length !== lines.length ||
    lines.some(line => line.quantity !== line.raw_quantity.value || line.received_quantity !== line.raw_received_quantity.value || line.received_quantity > line.quantity ||
      !row.items.some(approved => approved.id === line.item_id && approved.quantity === line.quantity)) || !lines.some(line => line.received_quantity > 0)) throw conflict();
  for (const selected of input.items) {
    const line = lines.find(value => value.item_id === selected.item_id);
    const previous = history.filter(value => value.case_id === context.case_id || value.native_return_id === returned.id)
      .flatMap(value => value.allocation.lines).filter(value => value.item_id === selected.item_id).reduce((sum, value) => sum + value.quantity, 0);
    if (!line || previous + selected.quantity > line.received_quantity) throw conflict();
  }
}
/** Internal staff command: caller must authenticate a staff session first. This
 * only reserves original amounts; it never calls a payment/tax provider. */
export async function reserveTaxRefund(scope: MedusaContainer, rawOrderId: unknown, rawOperationId: unknown, rawInput: unknown, rawContext: unknown, readSource: SourceReader = readTaxRefundSource) {
  const orderId = saleOrderId.parse(rawOrderId), operationId = z.uuid().parse(rawOperationId), input = normalizedInput(rawInput), context = contextSchema.parse(rawContext);
  return dbFor(scope).transaction(async db => {
    await lockOrder(db, orderId); await staffExists(db, context.staff_id);
    const existing = (await db.raw(`select ${fields} from commerce.snowforce_refund_allocations where id=?`, [operationId])).rows;
    if (existing.length) {
      const row = checkedTaxRefundReservation(z.array(z.unknown()).length(1).parse(existing)[0]);
      if (row.order_id !== orderId || row.input_fingerprint !== taxSaleFingerprint(input) || row.case_id !== context.case_id || row.case_version !== context.case_version ||
        row.native_return_id !== context.native_return_id || row.staff_id !== context.staff_id || row.state === "cancelled") throw conflict();
      return row;
    }
    const source = await readSource(scope, orderId), sale = checkedRefundSale(source.sale);
    const committed = z.array(z.object({ source: z.unknown(), snapshot: z.unknown(), account_id: z.string(), livemode: z.boolean(), transaction_id: z.string() })).length(1).parse((await db.raw(
      `select t.source,s.snapshot,s.account_id,s.livemode,s.transaction_id from commerce.snowforce_tax_sale_tasks t join commerce.snowforce_tax_sales s on s.task_id=t.id
        where t.id=? and t.order_id=? and t.state='ready' for share of t,s`, [sale.operation_id, orderId])).rows)[0];
    if (taxSaleFingerprint(committed.source) !== taxSaleFingerprint(sale.source) || taxSaleFingerprint(committed.snapshot) !== taxSaleFingerprint(sale.snapshot) ||
      committed.account_id !== sale.source.input.account_id || committed.livemode !== sale.source.input.livemode || committed.transaction_id !== sale.original.transaction.id) throw conflict();
    // Every prior native refund must have completed cash, tax and order proof.
    await assertRefundPayment(db, source.sale);
    const history = await readHistory(db, orderId);
    await assertReceipt(db, orderId, context, input, history);
    const allocation = buildTaxRefundAllocation(source.sale, source.order_lines, history.map(value => value.allocation), input, operationId);
    const sourceData = { sale: source.sale, order_lines: source.order_lines }, request = taxRefundReversalRequest(source.sale, allocation);
    const inserted = await db.raw(`insert into commerce.snowforce_refund_allocations
      (id,order_id,sale_task_id,case_id,case_version,native_return_id,staff_id,account_id,livemode,payment_id,total_cents,input,input_fingerprint,source_data,source_fingerprint,allocation,allocation_fingerprint,request,request_fingerprint)
      values (?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?,?::jsonb,?,?::jsonb,?,?::jsonb,?) returning ${fields}`,
      [operationId, orderId, sale.operation_id, context.case_id, context.case_version, context.native_return_id, context.staff_id, sale.source.input.account_id, sale.source.input.livemode,
        sale.source.payment_id, allocation.total_cents, JSON.stringify(input), taxSaleFingerprint(input), JSON.stringify(sourceData), taxSaleFingerprint(sourceData),
        JSON.stringify(allocation), taxSaleFingerprint(allocation), JSON.stringify(request), taxSaleFingerprint(request)]);
    return checkedTaxRefundReservation(z.array(z.unknown()).length(1).parse(inserted.rows)[0]);
  });
}
/** Freeze before a future provider attempt. A started task cannot release units
 * after a lost response. This phase does not invoke any provider. */
export async function startTaxRefundReservation(scope: MedusaContainer, rawOrderId: unknown, rawOperationId: unknown, rawStaffId: unknown) {
  const orderId = saleOrderId.parse(rawOrderId), id = z.uuid().parse(rawOperationId), staffId = contextSchema.shape.staff_id.parse(rawStaffId);
  return dbFor(scope).transaction(async db => {
    await lockOrder(db, orderId); await staffExists(db, staffId);
    const row = checkedTaxRefundReservation(z.array(z.unknown()).length(1).parse((await db.raw(`select ${fields} from commerce.snowforce_refund_allocations where id=? and order_id=? for update`, [id, orderId])).rows)[0]);
    if (row.staff_id !== staffId || row.state === "cancelled") throw conflict();
    if (row.state === "started") return row;
    await assertRefundPayment(db, row.source_data.sale);
    await assertReceipt(db, orderId, { case_id: row.case_id, case_version: row.case_version, native_return_id: row.native_return_id, staff_id: staffId }, row.input, (await readHistory(db, orderId)).filter(value => value.id !== id));
    return checkedTaxRefundReservation(z.array(z.unknown()).length(1).parse((await db.raw(`update commerce.snowforce_refund_allocations set state='started',first_attempt_at=clock_timestamp() where id=? and state='reserved' returning ${fields}`, [id])).rows)[0]);
  });
}
/** Read-only approval recheck immediately before a first/unknown funds POST.
 * Frozen amounts do not authorize a later canceled or changed return review. */
export async function recheckRefundExecutionApproval(scope: MedusaContainer, rawId: unknown) {
  const id = z.uuid().parse(rawId), db = dbFor(scope);
  const before = checkedTaxRefundReservation(z.array(z.unknown()).length(1).parse((await db.raw(`select ${fields} from commerce.snowforce_refund_allocations where id=?`, [id])).rows)[0]);
  await db.transaction(async tx => {
    await lockOrder(tx, before.order_id); await staffExists(tx, before.staff_id);
    const row = checkedTaxRefundReservation(z.array(z.unknown()).length(1).parse((await tx.raw(`select ${fields} from commerce.snowforce_refund_allocations where id=? and order_id=? for update`, [id, before.order_id])).rows)[0]);
    if (row.state !== "started" || row.allocation_fingerprint !== before.allocation_fingerprint) throw conflict();
    await assertReceipt(tx, row.order_id, { case_id: row.case_id, case_version: row.case_version, native_return_id: row.native_return_id, staff_id: row.staff_id }, row.input,
      (await readHistory(tx, row.order_id)).filter(value => value.id !== id));
  });
}
/** Only the latest untouched reservation may be released: later plans depend
 * on its per-unit rounding position. The audit row is retained. */
export async function cancelTaxRefundReservation(scope: MedusaContainer, rawOrderId: unknown, rawOperationId: unknown, rawStaffId: unknown, rawReason: unknown) {
  const orderId = saleOrderId.parse(rawOrderId), id = z.uuid().parse(rawOperationId), staffId = contextSchema.shape.staff_id.parse(rawStaffId), reason = z.string().trim().min(5).max(1000).parse(rawReason);
  return dbFor(scope).transaction(async db => {
    await lockOrder(db, orderId); await staffExists(db, staffId);
    const row = checkedTaxRefundReservation(z.array(z.unknown()).length(1).parse((await db.raw(`select ${fields} from commerce.snowforce_refund_allocations where id=? and order_id=? for update`, [id, orderId])).rows)[0]);
    if (row.staff_id !== staffId || row.first_attempt_at || row.state === "started") throw conflict();
    if (row.state === "cancelled") { if (row.cancellation_reason !== reason) throw conflict(); return row; }
    if ((await readHistory(db, orderId)).at(-1)?.id !== id) throw conflict();
    return checkedTaxRefundReservation(z.array(z.unknown()).length(1).parse((await db.raw(`update commerce.snowforce_refund_allocations set state='cancelled',cancelled_at=clock_timestamp(),cancellation_reason=? where id=? and state='reserved' returning ${fields}`, [reason, id])).rows)[0]);
  });
}
