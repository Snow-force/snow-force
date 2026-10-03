import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { actor, customerAfterSalesList, submitAfterSales } from "../../../../../../lib/after-sales";

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await customerAfterSalesList(req.scope,req.params.id,actor(req.auth_context?.actor_id)));
}
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json({request:await submitAfterSales(req.scope,req.params.id,actor(req.auth_context?.actor_id),req.body)});
}
