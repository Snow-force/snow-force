import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { actor, reconcileAfterSalesFunds } from "../../../../../../lib/after-sales";

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const staffId = actor(req.auth_context?.actor_id);
  res.json({ funds: await reconcileAfterSalesFunds(req.scope, req.params.id, staffId) });
}
