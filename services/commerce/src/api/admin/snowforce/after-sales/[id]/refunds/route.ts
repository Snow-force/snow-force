import type {AuthenticatedMedusaRequest,MedusaResponse} from "@medusajs/framework/http";
import {adminRefundPlans,prepareAdminRefund} from "../../../../../../lib/refund-admin";
export async function GET(req:AuthenticatedMedusaRequest,res:MedusaResponse){
  res.setHeader("Cache-Control","private, no-store");res.json(await adminRefundPlans(req.scope,req.auth_context,req.params.id));
}
export async function POST(req:AuthenticatedMedusaRequest,res:MedusaResponse){
  res.setHeader("Cache-Control","private, no-store");res.json(await prepareAdminRefund(req.scope,req.auth_context,req.params.id,req.body));
}
