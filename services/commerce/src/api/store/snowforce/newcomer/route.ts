import type { AuthenticatedMedusaRequest, MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { claimNewcomer } from "../../../../lib/newcomer";
import { newcomerPolicy } from "../../../../lib/newcomer-policy";
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.json({ policy: newcomerPolicy() });
}
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.json(await claimNewcomer(req.scope, req.auth_context.actor_id, req.body));
}
