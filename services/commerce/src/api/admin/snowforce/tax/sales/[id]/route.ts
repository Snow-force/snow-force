import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { reconcileTaxSale } from "../../../../../../lib/tax-sale-worker";
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await reconcileTaxSale(req.scope, req.auth_context, req.params.id, req.body));
}
