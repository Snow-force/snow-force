import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
export function useAfterSalesBoundary(_req: MedusaRequest, _res: MedusaResponse, _next: MedusaNextFunction) {
  throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Submit a return or exchange request through your SnowForce order.");
}
