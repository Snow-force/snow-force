import { z } from "zod";
import { shopPublishedPolicySchema } from "./policies";

export const afterSalesStatuses=["pending","approved","processing","completed","rejected","cancelled"] as const;
const line=z.object({id:z.string().regex(/^ordli_[A-Za-z0-9]+$/),quantity:z.number().int().positive().max(10000)}).strict();
export const afterSalesInput=z.object({requestKey:z.string().uuid(),kind:z.enum(["return","exchange"]),reason:z.enum(["size","quality","incorrect","other"]),description:z.string().trim().min(5).max(2000),items:z.array(line).min(1).max(100)}).strict().refine((value)=>new Set(value.items.map((item)=>item.id)).size===value.items.length);
export const afterSalesCustomerUpdate=z.discriminatedUnion("command",[
  z.object({command:z.literal("cancel"),version:z.number().int().positive()}).strict(),
  z.object({command:z.literal("tracking"),version:z.number().int().positive(),carrier:z.string().trim().min(1).max(100),trackingNumber:z.string().trim().min(1).max(200)}).strict(),
]);
const date=z.string().datetime();
export const afterSalesRequest=z.object({id:z.string().uuid(),order_id:z.string().regex(/^order_[A-Za-z0-9]+$/),kind:z.enum(["return","exchange"]),reason:z.enum(["size","quality","incorrect","other"]),description:z.string(),items:z.array(line),status:z.enum(afterSalesStatuses),version:z.number().int().positive(),customer_message:z.string(),return_carrier:z.string(),return_tracking_number:z.string(),created_at:date,updated_at:date,reviewed_at:date.nullable(),history:z.array(z.object({status:z.enum(afterSalesStatuses),message:z.string(),at:date}))}).strict();
const calendarDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const parsed=new Date(`${value}T00:00:00.000Z`);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;});
export const afterSalesPurchase=z.object({orderId:z.string().regex(/^order_[A-Za-z0-9]+$/),policy:shopPublishedPolicySchema.nullable(),assessedOn:calendarDate,
  lines:z.array(z.object({id:z.string().regex(/^ordli_[A-Za-z0-9]+$/),title:z.string(),status:z.enum(["within_window","expired","manual"]),earliestDeadline:calendarDate.nullable(),latestDeadline:calendarDate.nullable()}).strict()).max(100),
  dispatches:z.array(z.object({requestId:z.string().uuid(),dispatchBy:calendarDate}).strict()).max(100),
}).strict().refine(value=>new Set(value.lines.map(line=>line.id)).size===value.lines.length&&new Set(value.dispatches.map(line=>line.requestId)).size===value.dispatches.length)
  .refine(value=>value.lines.every(line=>{
    if(!line.earliestDeadline||!line.latestDeadline)return line.earliestDeadline===null&&line.latestDeadline===null&&line.status==="manual";
    if(!value.policy||line.earliestDeadline>line.latestDeadline)return false;
    return line.status==="within_window"?value.assessedOn<=line.earliestDeadline:line.status==="expired"?value.assessedOn>line.latestDeadline:true;
  })).refine(value=>!!value.policy||value.dispatches.length===0);
export type AfterSalesPurchase=z.infer<typeof afterSalesPurchase>;
export const afterSalesList=z.object({requests:z.array(afterSalesRequest).max(100),eligibleItems:z.array(z.object({id:z.string().regex(/^ordli_[A-Za-z0-9]+$/),title:z.string(),variant:z.string(),available:z.number().int().positive().max(10000)})).max(100),purchase:afterSalesPurchase.nullable().optional()}).strict().refine(value=>!value.purchase||value.purchase.dispatches.every(line=>value.requests.some(request=>request.id===line.requestId&&["approved","processing","completed"].includes(request.status))));
export type AfterSalesList=z.infer<typeof afterSalesList>;
export type AfterSalesRequest=z.infer<typeof afterSalesRequest>;
export type AfterSalesResult={state:"ready";data:AfterSalesList}|{state:"invalid"|"signed-out"|"rejected"|"unavailable"};
export const afterSalesStatusLabels={pending:{en:"Awaiting review",zh:"待审核"},approved:{en:"Approved",zh:"已批准"},processing:{en:"Being processed",zh:"处理中"},completed:{en:"Completed",zh:"已完成"},rejected:{en:"Declined",zh:"未批准"},cancelled:{en:"Cancelled",zh:"已撤销"}};
export const afterSalesReasonLabels={size:{en:"Fit / size",zh:"尺码不合适"},quality:{en:"Quality issue",zh:"质量问题"},incorrect:{en:"Incorrect item",zh:"发错商品"},other:{en:"Other",zh:"其他原因"}};
