import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { ILockingModule } from "@medusajs/framework/types";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { z } from "zod";
import { readPickupOffer } from "../../../../../lib/local-pickup";
import setupPickup from "../../../../../scripts/setup-pickup";

function staff(req: AuthenticatedMedusaRequest) {
  if (req.auth_context?.actor_type !== "user" || !/^user_[A-Za-z0-9]+$/.test(req.auth_context.actor_id)) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Staff sign-in is required.");
}
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  staff(req);
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ pickupOffer: await readPickupOffer(req.scope) });
}
export function createPickupSetupPost(setup = setupPickup, read = readPickupOffer) {
  return async function pickupSetupPost(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
    staff(req);
    if (!z.object({ confirm_review: z.literal(true) }).strict().safeParse(req.body).success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Review the configured warehouse before enabling free appointment pickup.");
    const offer = await req.scope.resolve<ILockingModule>(Modules.LOCKING).execute("snowforce-pickup-setup", async signal => {
      if (signal?.aborted) throw new MedusaError(MedusaError.Types.CONFLICT, "Reload pickup settings.");
      await setup({ container: req.scope, args: [] });
      const saved = await read(req.scope);
      if (signal?.aborted || !saved) throw new MedusaError(MedusaError.Types.CONFLICT, "Pickup setup needs a fresh review.");
      return saved;
    }, { timeout: 15, expire: 120 });
    res.json({ pickupOffer: offer });
  };
}
export const POST = createPickupSetupPost();
