import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { readOrderSnapshot } from "../../../../../lib/order-sync";

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!req.auth_context?.actor_id) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Authentication required.");
  const snapshot = await readOrderSnapshot(req.params.id, req.scope, req.auth_context.actor_id);
  if (!snapshot) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found.");
  res.json(snapshot);
}
