import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { listPaymentOperations } from "../../../../lib/payment-operations";
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await listPaymentOperations(req.scope, req.auth_context, req.query.filter, req.query.offset));
}
