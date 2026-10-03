import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { actor, adminAfterSalesList } from "../../../../lib/after-sales";
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  actor(req.auth_context?.actor_id);
  res.json(await adminAfterSalesList(req.scope,req.query.status,req.query.offset));
}
