import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { adminTaxSales } from "../../../../../lib/tax-sale-worker";
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await adminTaxSales(req.scope, req.auth_context));
}
