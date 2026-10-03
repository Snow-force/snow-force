import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { changePaymentOperation, paymentOperationDetail } from "../../../../../lib/payment-operations";
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await paymentOperationDetail(req.scope, req.auth_context, req.params.id));
}
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await changePaymentOperation(req.scope, req.auth_context, req.params.id, req.body));
}
