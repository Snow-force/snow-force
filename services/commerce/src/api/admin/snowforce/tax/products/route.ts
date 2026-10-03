import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { adminTaxProducts } from "../../../../../lib/tax-classification";
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) { res.json(await adminTaxProducts(req.scope, req.auth_context, req.query.offset)); }
