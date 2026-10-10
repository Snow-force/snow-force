import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { executeAdminRefund } from "../../../../../../../../lib/refund-admin";

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.status(202).json(await executeAdminRefund(req.scope, req.auth_context, req.params.id, req.params.operation, req.body));
}
