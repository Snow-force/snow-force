import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { adminTaxCodes } from "../../../../../lib/tax-classification";
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) { res.json(await adminTaxCodes(req.auth_context)); }
