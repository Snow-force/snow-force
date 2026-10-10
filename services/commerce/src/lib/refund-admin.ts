import type {AuthContext} from "@medusajs/framework/http";
import type {MedusaContainer} from "@medusajs/framework/types";
import {ContainerRegistrationKeys,MedusaError} from "@medusajs/framework/utils";
import {z} from "zod";
import type {TaxQuoteConnection} from "./tax-quote-ledger";
import {paymentAdminActor} from "./payment-operations";
import {checkedRefundSale,taxRefundInputSchema,TaxRefundConflict} from "./tax-refund-contract";
import {readTaxRefundSource} from "./tax-refund-source";
import {checkedTaxRefundReservation,reserveTaxRefund} from "./tax-refund-reservations";
import {refundReservationFields} from "./tax-refund-funds";
import {configuredRefundAdapter,requireConfiguredRefundAdapter} from "./refund-runtime";
import {queueRefundExecution} from "./refund-execution";

const caseSchema=z.object({id:z.uuid(),order_id:z.string().regex(/^order_[A-Za-z0-9]+$/),version:z.coerce.number().int().positive(),
  kind:z.enum(["return","exchange"]),status:z.string(),native_id:z.string().nullable()});
const dbFor=(scope:MedusaContainer)=>scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION);
async function readCase(db:TaxQuoteConnection,id:string){return z.array(caseSchema).length(1).parse((await db.raw(
  "select id,order_id,version,kind,status,native_id from commerce.snowforce_after_sales where id=?",[id])).rows)[0];}
async function returnId(db:TaxQuoteConnection,c:z.infer<typeof caseSchema>){
  if(c.status!=="processing"||!c.native_id)throw new TaxRefundConflict();
  if(c.kind==="return")return z.string().regex(/^return_[A-Za-z0-9]+$/).parse(c.native_id);
  return z.array(z.object({return_id:z.string().regex(/^return_[A-Za-z0-9]+$/)})).length(1).parse((await db.raw(
    "select return_id from commerce.order_exchange where id=? and order_id=? and canceled_at is null and deleted_at is null",[c.native_id,c.order_id])).rows)[0].return_id;
}
export function safeRefundReservation(raw:unknown){
  const row=checkedTaxRefundReservation(raw);
  return {id:row.id,state:row.state,allocation_fingerprint:row.allocation_fingerprint,total_cents:row.total_cents,livemode:row.livemode,
    items:row.allocation.lines.map(line=>({item_id:line.item_id,quantity:line.quantity,net_cents:line.net_cents,sales_tax_cents:line.sales_tax_cents})),
    shipping_cents:row.allocation.shipping_cents,shipping_tax_cents:row.allocation.shipping_tax_cents,
    fees:row.allocation.fees.map(fee=>({state:fee.state,amount_cents:fee.amount_cents})),fee_decisions:row.input.fee_decisions};
}
export async function adminRefundPlans(scope:MedusaContainer,auth:AuthContext|undefined,rawId:unknown,readSource:typeof readTaxRefundSource=readTaxRefundSource){
  paymentAdminActor(auth);const id=z.uuid().parse(rawId),db=dbFor(scope),c=await readCase(db,id);
  const history=(await db.raw(`select ${refundReservationFields} from commerce.snowforce_refund_allocations where order_id=? order by sequence`,[c.order_id])).rows.map(checkedTaxRefundReservation);
  const execution_enabled=!!configuredRefundAdapter(scope);
  const plans=history.filter(a=>a.case_id===id).map(safeRefundReservation);
  const executions=execution_enabled?z.array(z.object({id:z.uuid(),state:z.string(),tax_state:z.string().nullable()})).parse((await db.raw(
    "select e.id,e.state,t.state as tax_state from commerce.snowforce_refund_executions e join commerce.snowforce_refund_allocations a on a.id=e.id left join commerce.snowforce_refund_tax_tasks t on t.id=e.id where a.case_id=? order by a.sequence",[id])).rows):[];
  if(c.status!=="processing")return {case_id:id,version:c.version,can_prepare:false,execution_enabled,items:[],shipping_available:false,fees:[],plans,executions};
  const returned=await returnId(db,c),source=await readSource(scope,c.order_id),sale=checkedRefundSale(source.sale);
  const receipts=z.array(z.object({item_id:z.string(),received_quantity:z.coerce.number().int().nonnegative(),raw_received_quantity:z.object({value:z.coerce.number().int().nonnegative()})})).parse((await db.raw(
    "select item_id,received_quantity,raw_received_quantity from commerce.return_item where return_id=? and deleted_at is null order by item_id",[returned])).rows);
  if(receipts.some(r=>r.received_quantity!==r.raw_received_quantity.value)||new Set(receipts.map(r=>r.item_id)).size!==receipts.length)throw new TaxRefundConflict();
  const active=history.filter(a=>a.state!=="cancelled"),items=source.bindings.map(binding=>{
    const receipt=receipts.find(r=>r.item_id===binding.item_id),paid=sale.quote.input.lines.find(line=>line.id===binding.cart_line_id);
    if(!paid)throw new TaxRefundConflict();
    const globalUsed=active.flatMap(a=>a.allocation.lines).filter(line=>line.item_id===binding.item_id).reduce((n,line)=>n+line.quantity,0);
    const caseUsed=active.filter(a=>a.case_id===id||a.native_return_id===returned).flatMap(a=>a.allocation.lines).filter(line=>line.item_id===binding.item_id).reduce((n,line)=>n+line.quantity,0);
    return {item_id:binding.item_id,title:paid.title,available_quantity:Math.max(0,Math.min(paid.quantity-globalUsed,(receipt?.received_quantity??0)-caseUsed))};
  }).filter(item=>item.available_quantity>0);
  return {case_id:id,version:c.version,can_prepare:true,execution_enabled,items,executions,
    shipping_available:!active.some(a=>a.input.refund_shipping),fees:sale.quote.fees.map(fee=>({state:fee.state,amount_cents:fee.amount_cents})),plans};
}
export async function prepareAdminRefund(scope:MedusaContainer,auth:AuthContext|undefined,rawId:unknown,rawBody:unknown,readSource:typeof readTaxRefundSource=readTaxRefundSource){
  const staff=paymentAdminActor(auth),id=z.uuid().parse(rawId),body=z.object({operation_id:z.uuid(),version:z.number().int().positive(),input:taxRefundInputSchema}).strict().parse(rawBody);
  const db=dbFor(scope),c=await readCase(db,id);
  if(c.version!==body.version)throw new MedusaError(MedusaError.Types.CONFLICT,"The return review changed. Refresh the refund preview.");
  const native=await returnId(db,c);
  const reservation=await reserveTaxRefund(scope,c.order_id,body.operation_id,body.input,{case_id:id,case_version:c.version,native_return_id:native,staff_id:staff},readSource);
  return {plan:safeRefundReservation(reservation),execution_enabled:!!configuredRefundAdapter(scope)};
}

/** Staff executes the immutable plan they reviewed, never caller-supplied money. */
export async function executeAdminRefund(scope:MedusaContainer,auth:AuthContext|undefined,rawCase:unknown,rawOperation:unknown,rawBody:unknown){
  paymentAdminActor(auth);
  const caseId=z.uuid().parse(rawCase),operation=z.uuid().parse(rawOperation),body=z.object({version:z.number().int().positive(),allocation_fingerprint:z.string().regex(/^[a-f0-9]{64}$/),confirmed:z.literal(true)}).strict().parse(rawBody);
  requireConfiguredRefundAdapter(scope);
  const db=dbFor(scope),c=await readCase(db,caseId);
  if(c.status!=="processing"||c.version!==body.version)throw new MedusaError(MedusaError.Types.CONFLICT,"The return review changed. Refresh before executing a refund.");
  const rows=(await db.raw(`select ${refundReservationFields} from commerce.snowforce_refund_allocations where id=? and case_id=?`,[operation,caseId])).rows;
  const reservation=checkedTaxRefundReservation(z.array(z.unknown()).length(1).parse(rows)[0]);
  if(reservation.case_id!==caseId||reservation.case_version!==body.version)throw new TaxRefundConflict();
  return {execution:await queueRefundExecution(scope,auth,operation,{allocation_fingerprint:body.allocation_fingerprint,confirmed:true})};
}
