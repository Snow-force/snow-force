import type { AuthenticatedMedusaRequest, MedusaRequest, MedusaNextFunction, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";

export async function requireOwnedCart(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  const actorId = (req as Partial<AuthenticatedMedusaRequest>).auth_context?.actor_id;
  if (!actorId) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in through SnowForce.");
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const id = req.params.id ?? req.query.cart_id;
  if (typeof id !== "string" || !/^cart_[a-zA-Z0-9]+$/.test(id)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid cart.");
  const checksEditBoundary = req.method !== "GET" && !req.path.endsWith("/complete");
  // Reads and completion retries only need ownership here. The native workflow
  // independently validates completion; editing still reads every payment fence.
  const fields = checksEditBoundary
    ? ["id", "customer_id", "completed_at", "metadata", "payment_collection.payment_sessions.status"]
    : ["id", "customer_id"];
  const { data } = await query.graph({ entity: "cart", fields, filters: { id } });
  const cart = data[0];
  if (!cart || cart.customer_id !== actorId) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found.");
  if (checksEditBoundary) {
    const sessions = cart.payment_collection?.payment_sessions;
    if (cart.completed_at || (Array.isArray(sessions) && sessions.length) || (cart.metadata && Object.hasOwn(cart.metadata,"snowforce_tax_quote"))) throw new MedusaError(MedusaError.Types.CONFLICT, "Check the existing quote and payment before changing this cart.");
  }
  next();
}
export function useCheckoutBoundary(_req: MedusaRequest, _res: MedusaResponse, _next: MedusaNextFunction) {
  throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Use the SnowForce checkout.");
}
