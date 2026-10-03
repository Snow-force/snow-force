import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { saveTaxClassification } from "../../../../../../lib/tax-classification";
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) { res.json(await saveTaxClassification(req.scope, req.auth_context, req.params.id, req.body)); }
