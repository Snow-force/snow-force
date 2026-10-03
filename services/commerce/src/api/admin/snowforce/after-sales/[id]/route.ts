import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { actor, adminAfterSalesDetail, reviewAfterSales } from "../../../../../lib/after-sales";
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  actor(req.auth_context?.actor_id);
  res.json(await adminAfterSalesDetail(req.scope,req.params.id));
}
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json({request:await reviewAfterSales(req.scope,req.params.id,actor(req.auth_context?.actor_id),req.body)});
}
