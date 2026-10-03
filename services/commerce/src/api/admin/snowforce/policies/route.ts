import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { adminShopPolicy, changeShopPolicy } from "../../../../lib/shop-policy";

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await adminShopPolicy(req.scope, req.auth_context?.actor_id));
}

// Native /admin authentication applies; actor_id is rechecked before any database access.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await changeShopPolicy(req.scope, req.auth_context?.actor_id, req.body));
}
