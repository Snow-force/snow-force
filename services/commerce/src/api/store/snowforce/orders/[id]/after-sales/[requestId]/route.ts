import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { actor, customerUpdateAfterSales } from "../../../../../../../lib/after-sales";

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json({request:await customerUpdateAfterSales(req.scope,req.params.id,req.params.requestId,actor(req.auth_context?.actor_id),req.body)});
}
