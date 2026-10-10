import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getMerchandising, saveMerchandising } from "../../../../../../lib/merchandising";
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) { res.setHeader("Cache-Control", "private, no-store"); res.json(await getMerchandising(req.scope, req.auth_context, req.params.kind, req.params.id)); }
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) { res.setHeader("Cache-Control", "private, no-store"); res.json(await saveMerchandising(req.scope, req.auth_context, req.params.kind, req.params.id, req.body)); }
