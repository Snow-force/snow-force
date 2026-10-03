import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { adminStripeTaxSetup } from "../../../../../lib/tax-setup";
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await adminStripeTaxSetup(req.scope, req.auth_context));
}
