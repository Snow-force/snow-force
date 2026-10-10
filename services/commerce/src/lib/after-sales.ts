import type { MedusaContainer } from "@medusajs/framework/types";
import { BigNumber, ContainerRegistrationKeys, MathBN, MedusaError } from "@medusajs/framework/utils";
import { getOrderDetailWorkflow } from "@medusajs/medusa/core-flows";
import { z } from "zod";
import { orderMemberId } from "./order-sync";
import { afterSalesInput, afterSalesReview, afterSalesCustomerUpdate, afterSalesRow, assertAfterSalesItems, assertCustomerUpdate, customerAfterSales, returnableQuantity, type AfterSalesRow } from "./after-sales-policy";
import { assertRefundFundsSucceeded, lastOrderRefundFunds, saveRefundFundsCheck, verifyOrderRefundFunds, type RefundFundsCheck, type StripeRefundReader } from "./refund-finality";
import { afterSalesTiming, afterSalesTimingOrder, assessReturnWindow, assertReturnWindowReview, calendarDeadline, verifiedOrderPurchasePolicy } from "./after-sales-timing";
import { assertAfterSalesRefundCompletion } from "./after-sales-refund-completion";
import type { TaxQuoteConnection } from "./tax-quote-ledger";

type Binding = string | number;
export type AfterSalesConnection = TaxQuoteConnection;
const rows = z.array(afterSalesRow);
const id = z.string().uuid();
const orderIdSchema = z.string().regex(/^order_[A-Za-z0-9]+$/);
const orderSchema = afterSalesTimingOrder.extend({ id: orderIdSchema, status: z.string(), currency_code: z.literal("usd"), items: z.array(z.object({ id: z.string(), title: z.string(), variant_title: z.string().nullish(), detail: z.record(z.string(), z.unknown()).nullish() })) });
const connection = (scope: MedusaContainer) => scope.resolve<AfterSalesConnection>(ContainerRegistrationKeys.PG_CONNECTION);
const notFound = () => new MedusaError(MedusaError.Types.NOT_FOUND, "Request not found.");
const conflict = () => new MedusaError(MedusaError.Types.CONFLICT, "The request or order changed. Refresh before continuing.");
export function actor(actorId: string | undefined) { if (!actorId) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Authentication required."); return actorId; }
export function parseInput<Schema extends z.ZodType>(schema: Schema, value: unknown): z.output<Schema> {
  const parsed = schema.safeParse(value); if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter valid request details."); return parsed.data;
}
async function ownedOrder(scope: MedusaContainer, orderId: string, customerId: string) {
  if (!orderIdSchema.safeParse(orderId).success) throw notFound();
  const { result } = await getOrderDetailWorkflow(scope).run({ input: { order_id: orderId, fields: ["id","customer_id","created_at","metadata","status","currency_code","items.*","items.detail.*","fulfillments.canceled_at","fulfillments.delivered_at","fulfillments.items.line_item_id"], filters: { customer_id: customerId, is_draft_order: false } } });
  const order = orderSchema.parse(result);
  if (order.customer_id !== customerId) throw notFound();
  const memberId = await orderMemberId(customerId, scope); if (!memberId) throw notFound();
  return { order, memberId };
}
async function readCase(db: AfterSalesConnection, requestId: string, lock = false) {
  if (!id.safeParse(requestId).success) throw notFound();
  const result = await db.raw(`select * from commerce.snowforce_after_sales where id=?${lock ? " for update" : ""}`, [requestId]);
  const row = rows.parse(result.rows)[0]; if (!row) throw notFound(); return row;
}
export async function customerAfterSalesList(scope: MedusaContainer, orderId: string, customerId: string) {
  const { order, memberId } = await ownedOrder(scope, orderId, actor(customerId));
  const result = await connection(scope).raw("select * from commerce.snowforce_after_sales where order_id=? and customer_id=? and member_id=? order by created_at desc limit 100", [orderId, customerId, memberId]);
  const cases = rows.parse(result.rows);
  const policy = await verifiedOrderPurchasePolicy(scope, order), now = new Date().toISOString();
  const window = assessReturnWindow(order, order.items, "size", now, policy ? { version: policy.version, ...policy.content.terms } : null);
  const purchase = { orderId: order.id, policy, assessedOn: window.requestedOn,
    lines: window.lines.map(line => ({ ...line, title: order.items.find(item => item.id === line.id)!.title })),
    dispatches: cases.flatMap(value => policy && ["approved", "processing", "completed"].includes(value.status) && value.reviewed_at && Date.parse(value.reviewed_at) >= Date.parse(value.created_at) && Date.parse(value.reviewed_at) <= Date.parse(now) ? [{ requestId: value.id, dispatchBy: calendarDeadline(value.reviewed_at, policy.content.terms.approved_dispatch_days) }] : []),
  };
  return { requests: cases.map(customerAfterSales), eligibleItems: order.status === "canceled" ? [] : order.items.map((line) => ({ id: line.id, title: line.title, variant: line.variant_title ?? "", available: returnableQuantity(line.detail) })).filter((line) => line.available > 0), purchase };
}
export async function submitAfterSales(scope: MedusaContainer, orderId: string, customerId: string, raw: unknown) {
  actor(customerId); const input = parseInput(afterSalesInput, raw);
  return connection(scope).transaction(async (db) => {
    await db.raw("select pg_advisory_xact_lock(7302,hashtext(?))", [orderId]);
    const { order, memberId } = await ownedOrder(scope, orderId, customerId);
    const previous = rows.parse((await db.raw("select * from commerce.snowforce_after_sales where id=?", [input.requestKey])).rows)[0];
    if (previous) {
      if (previous.order_id !== orderId || previous.customer_id !== customerId || previous.member_id !== memberId) throw notFound();
      if (previous.kind !== input.kind || previous.reason !== input.reason || previous.description !== input.description || JSON.stringify([...previous.items].sort((a,b)=>a.id.localeCompare(b.id))) !== JSON.stringify([...input.items].sort((a,b)=>a.id.localeCompare(b.id)))) throw conflict();
      return customerAfterSales(previous);
    }
    const active = await db.raw("select id from commerce.snowforce_after_sales where order_id=? and status in ('pending','approved','processing')", [orderId]);
    if (active.rows.length) throw conflict();
    assertAfterSalesItems(order, input);
    const result = await db.raw("insert into commerce.snowforce_after_sales(id,order_id,customer_id,member_id,kind,reason,description,items) values(?,?,?,?,?,?,?,?::jsonb) returning *", [input.requestKey,orderId,customerId,memberId,input.kind,input.reason,input.description,JSON.stringify(input.items)]);
    return customerAfterSales(rows.parse(result.rows)[0]);
  });
}
export async function customerUpdateAfterSales(scope: MedusaContainer, orderId: string, requestId: string, customerId: string, raw: unknown) {
  const { memberId } = await ownedOrder(scope, orderId, actor(customerId)); const input = parseInput(afterSalesCustomerUpdate, raw);
  return connection(scope).transaction(async (db) => {
    const row = await readCase(db, requestId, true);
    if (row.order_id !== orderId || row.customer_id !== customerId || row.member_id !== memberId) throw notFound();
    assertCustomerUpdate(row,input);
    const update = input.command === "cancel" ? { sql: "status='cancelled'", values: [] } : { sql: "return_carrier=?,return_tracking_number=?", values: [input.carrier,input.trackingNumber] };
    const result = await db.raw(`update commerce.snowforce_after_sales set ${update.sql},version=version+1 where id=? and version=? returning *`, [...update.values,requestId,input.version]);
    return customerAfterSales(rows.parse(result.rows)[0]);
  });
}
export async function adminAfterSalesList(scope: MedusaContainer, status: unknown, offset: unknown) {
  const state = parseInput(z.enum(["all","pending","approved","processing","completed","rejected","cancelled"]).default("pending"),status);
  const pageOffset = parseInput(z.coerce.number().int().min(0).max(100000).default(0),offset);
  const where = state === "all" ? "" : " where status=?"; const values = state === "all" ? [] : [state];
  const db = connection(scope);
  const result = await db.raw(`select * from commerce.snowforce_after_sales${where} order by created_at desc,id desc limit 50 offset ?`, [...values,pageOffset]);
  const count = z.array(z.object({ count:z.coerce.number().int() })).parse((await db.raw(`select count(*) from commerce.snowforce_after_sales${where}`,values)).rows)[0].count;
  return { requests: rows.parse(result.rows), count, offset: pageOffset };
}
const nativeQuantity = z.union([z.instanceof(BigNumber),z.number(),z.string()]).transform((value)=>MathBN.convert(value).toNumber()).pipe(z.number().int().nonnegative());
const nativeReturn = z.object({ id:z.string(), display_id:z.union([z.number(),z.string()]).optional(),created_at:z.coerce.date(), order_id:z.string(), status:z.string(), canceled_at:z.unknown().nullable(), exchange_id:z.string().nullish(), claim_id:z.string().nullish(),
  exchange:z.object({id:z.string()}).nullish(),claim:z.object({id:z.string()}).nullish(),
  items:z.array(z.object({ item_id:z.string(), quantity:nativeQuantity, received_quantity:nativeQuantity })) }).transform(value=>{
  if(value.exchange_id&&value.exchange&&value.exchange_id!==value.exchange.id||value.claim_id&&value.claim&&value.claim_id!==value.claim.id)throw conflict();
  return {...value,exchange_id:value.exchange_id??value.exchange?.id??null,claim_id:value.claim_id??value.claim?.id??null};
});
export function validateNativeReturn(row: AfterSalesRow, raw: unknown) {
  const value = nativeReturn.parse(raw);
  if (value.order_id !== row.order_id || value.created_at.getTime()<new Date(row.created_at).getTime() || value.canceled_at || value.status === "canceled" || value.claim_id || (row.kind === "return" && value.exchange_id) || value.items.length !== row.items.length || row.items.some((line)=>!value.items.some((native)=>native.item_id===line.id && native.quantity===line.quantity))) throw conflict();
  return value;
}
async function nativeCandidates(scope: MedusaContainer, row: AfterSalesRow) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const returns = await query.graph({entity:"return",fields:["id","display_id","created_at","order_id","status","canceled_at","exchange_id","claim_id","exchange.id","claim.id","items.item_id","items.quantity","items.received_quantity"],filters:{order_id:row.order_id}});
  const exchanges = row.kind === "exchange" ? await query.graph({entity:"order_exchange",fields:["id","display_id","order_id","return_id","canceled_at","additional_items.item_id","additional_items.quantity"],filters:{order_id:row.order_id}}) : {data:[]};
  const parsedReturns = z.array(nativeReturn).parse(returns.data);
  const parsedExchanges = z.array(z.object({id:z.string(),display_id:z.union([z.number(),z.string()]).optional(),order_id:z.string(),return_id:z.string().nullable(),canceled_at:z.unknown().nullable(),additional_items:z.array(z.object({item_id:z.string(),quantity:nativeQuantity}))})).parse(exchanges.data);
  const used = z.array(z.object({native_id:z.string().nullable()})).parse((await connection(scope).raw("select native_id from commerce.snowforce_after_sales where order_id=? and id<>?",[row.order_id,row.id])).rows).map((value)=>value.native_id);
  return parsedReturns.flatMap((value) => {
    try { validateNativeReturn(row,value); } catch { return []; }
    if (row.kind === "return") return used.includes(value.id) ? [] : [{id:value.id,label:`Return #${value.display_id??value.id}`,returned:value,additional:[]}];
    const exchange=parsedExchanges.find((entry)=>entry.return_id===value.id && entry.id===value.exchange_id && entry.order_id===row.order_id && !entry.canceled_at && entry.additional_items.length>0);
    return exchange && !used.includes(exchange.id) ? [{id:exchange.id,label:`Exchange #${exchange.display_id??exchange.id}`,returned:value,additional:exchange.additional_items}] : [];
  });
}
export async function adminAfterSalesDetail(scope: MedusaContainer, requestId: string) {
  const request = await readCase(connection(scope),requestId);
  const {order}=await ownedOrder(scope,request.order_id,request.customer_id);
  const timing = await afterSalesTiming(scope, order, request.items, request.reason, request.created_at);
  const dispatchBy = request.reviewed_at && timing.approvedDispatchDays && ["approved", "processing", "completed"].includes(request.status) ? calendarDeadline(request.reviewed_at, timing.approvedDispatchDays) : null;
  return { request, timing: { ...timing, dispatchBy }, funds: await lastOrderRefundFunds(scope, request.order_id), items:request.items.map((line)=>({id:line.id,quantity:line.quantity,title:order.items.find((item)=>item.id===line.id)?.title??line.id,variant:order.items.find((item)=>item.id===line.id)?.variant_title??""})), candidates:(await nativeCandidates(scope,request)).map((value)=>({id:value.id,label:value.label,status:value.returned.status})) };
}
export function assertNativeCompletion(returned: z.infer<typeof nativeReturn>, pendingDifference: unknown, replacements: {quantity:number;delivered:number}[]) {
  const balance = z.union([z.instanceof(BigNumber),z.number().finite(),z.string().regex(/^-?\d+(?:\.\d+)?$/)]).transform((value)=>MathBN.convert(value)).parse(pendingDifference);
  if (returned.status !== "received" || returned.items.some((line)=>line.received_quantity!==line.quantity) || !MathBN.eq(balance,0) || replacements.some((line)=>line.delivered<line.quantity)) throw new MedusaError(MedusaError.Types.CONFLICT,"Complete native receipt, payment settlement and replacement delivery before closing this request.");
}
export async function reconcileAfterSalesFunds(scope: MedusaContainer, requestId: string, staffId: string, reader?: StripeRefundReader) {
  actor(staffId);
  const initial = await readCase(connection(scope), requestId);
  await ownedOrder(scope, initial.order_id, initial.customer_id);
  const check = await verifyOrderRefundFunds(scope, initial.order_id, reader);
  return connection(scope).transaction(async (db) => {
    const current = await readCase(db, requestId, true);
    if (current.version !== initial.version) throw conflict();
    await saveRefundFundsCheck(db, check, { source: "staff", staff_id: staffId, request_id: requestId });
    return check;
  });
}
export async function reviewAfterSales(scope: MedusaContainer, requestId: string, staffId: string, raw: unknown, reader?: StripeRefundReader) {
  actor(staffId); const input = parseInput(afterSalesReview,raw);
  // Stripe network calls must not hold the case or payment row locks.
  let fundsCheck: RefundFundsCheck | undefined;
  let completionOrderId: string | undefined;
  if (input.command === "complete") {
    const initial = await readCase(connection(scope), requestId);
    if (initial.version !== input.version || initial.status !== "processing") throw conflict();
    await ownedOrder(scope, initial.order_id, initial.customer_id);
    completionOrderId = initial.order_id;
    fundsCheck = await verifyOrderRefundFunds(scope, initial.order_id, reader);
    assertRefundFundsSucceeded(fundsCheck);
  }
  return connection(scope).transaction(async(db)=>{
    // Use the same order -> case -> payment lock order as refund reservations.
    if (completionOrderId && (await db.raw('select id from commerce."order" where id=? and deleted_at is null and status<>\'canceled\' and currency_code=\'usd\' for update', [completionOrderId])).rows.length !== 1) throw conflict();
    const row = await readCase(db,requestId,true); if(row.version!==input.version) throw conflict();
    let sql:string, values:Binding[];
    if(input.command==="review") {
      if(row.status!=="pending") throw conflict();
      if(input.decision==="approved") {
        const {order}=await ownedOrder(scope,row.order_id,row.customer_id);
        assertAfterSalesItems(order,{requestKey:row.id,kind:row.kind,reason:row.reason,description:row.description,items:row.items});
        const timing = await afterSalesTiming(scope, order, row.items, row.reason, row.created_at);
        assertReturnWindowReview(timing, input.policyException, input.internalNote);
        if (timing.requiresException) input.internalNote = `[Purchase-policy exception approved by staff]\n${input.internalNote.trim()}`;
      }
      sql="status=?,customer_message=?,internal_note=?,reviewed_by=?,reviewed_at=now()";values=[input.decision,input.message,input.internalNote,staffId];
    } else {
      const candidates = await nativeCandidates(scope,row); const native=candidates.find((value)=>value.id===(input.command==="link"?input.nativeId:row.native_id));
      if(!native) throw conflict();
      if(input.command==="link") { if(row.status!=="approved") throw conflict();sql="status='processing',native_id=?";values=[native.id]; }
      else {
        if(row.status!=="processing") throw conflict();
        const {result}=await getOrderDetailWorkflow(scope).run({input:{order_id:row.order_id,fields:["id","summary.*","items.*","items.detail.*"]}});
        const order=z.object({summary:z.object({pending_difference:z.unknown()}),items:z.array(z.object({id:z.string(),detail:z.object({delivered_quantity:nativeQuantity})}))}).parse(result);
        assertNativeCompletion(native.returned,order.summary.pending_difference,native.additional.map((line)=>({quantity:line.quantity,delivered:order.items.find((item)=>item.id===line.item_id)?.detail.delivered_quantity??0})));
        if (!fundsCheck) throw conflict();
        await saveRefundFundsCheck(db, fundsCheck, { source: "staff", staff_id: staffId, request_id: requestId });
        await assertAfterSalesRefundCompletion(db, row, native.returned.id, fundsCheck);
        sql="status='completed',customer_message=?";values=[input.message];
      }
    }
    const result=await db.raw(`update commerce.snowforce_after_sales set ${sql},version=version+1 where id=? and version=? returning *`,[...values,requestId,input.version]);
    return rows.parse(result.rows)[0];
  });
}
