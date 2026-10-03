"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCommerceCustomerSession } from "./commerce-auth";
import { CommerceAuthorizationError,CommerceNotFoundError,CommerceRejectedError } from "./commerce-client";
import { afterSalesInput,afterSalesCustomerUpdate,afterSalesList,afterSalesRequest,type AfterSalesResult } from "./after-sales";
const orderIdSchema=z.string().regex(/^order_[A-Za-z0-9]+$/);
function failure(error:unknown):AfterSalesResult {
  if(error instanceof CommerceAuthorizationError) return {state:"signed-out"};
  if(error instanceof CommerceRejectedError||error instanceof CommerceNotFoundError) return {state:"rejected"};
  return {state:"unavailable"};
}
async function readList(customer:Awaited<ReturnType<typeof getCommerceCustomerSession>>,orderId:string) {
  const data=await customer.request(`/store/snowforce/orders/${encodeURIComponent(orderId)}/after-sales`,afterSalesList,{token:customer.token});
  if(data.requests.some((request)=>request.order_id!==orderId)||(data.purchase&&data.purchase.orderId!==orderId)) throw new Error("Order mismatch");
  return data;
}
export async function getAfterSalesAction(orderId:string):Promise<AfterSalesResult> {
  if(!orderIdSchema.safeParse(orderId).success) return {state:"invalid"};
  try {const customer=await getCommerceCustomerSession();return {state:"ready",data:await readList(customer,orderId)};}
  catch(error){return failure(error);}
}
export async function submitAfterSalesAction(orderId:string,input:unknown):Promise<AfterSalesResult> {
  const parsed=afterSalesInput.safeParse(input);if(!orderIdSchema.safeParse(orderId).success||!parsed.success) return {state:"invalid"};
  try {
    const customer=await getCommerceCustomerSession();const path=`/store/snowforce/orders/${encodeURIComponent(orderId)}/after-sales`;
    const result=await customer.request(path,z.object({request:afterSalesRequest}).strict(),{method:"POST",token:customer.token,body:parsed.data});
    if(result.request.order_id!==orderId) throw new Error("Order mismatch");
    revalidatePath(`/member/orders/${orderId}`);
    return {state:"ready",data:await readList(customer,orderId)};
  } catch(error){return failure(error);}
}
export async function updateAfterSalesAction(orderId:string,requestId:string,input:unknown):Promise<AfterSalesResult> {
  const parsed=afterSalesCustomerUpdate.safeParse(input);if(!orderIdSchema.safeParse(orderId).success||!z.string().uuid().safeParse(requestId).success||!parsed.success) return {state:"invalid"};
  try {
    const customer=await getCommerceCustomerSession();const path=`/store/snowforce/orders/${encodeURIComponent(orderId)}/after-sales`;
    const result=await customer.request(`${path}/${encodeURIComponent(requestId)}`,z.object({request:afterSalesRequest}).strict(),{method:"POST",token:customer.token,body:parsed.data});
    if(result.request.order_id!==orderId||result.request.id!==requestId) throw new Error("Request mismatch");
    revalidatePath(`/member/orders/${orderId}`);
    return {state:"ready",data:await readList(customer,orderId)};
  } catch(error){return failure(error);}
}
