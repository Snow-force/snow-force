import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { marketingOperation } from "../../../../lib/marketing";

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json(await marketingOperation(req.scope, "shop", req.auth_context?.actor_id ?? "", req.body));
}
