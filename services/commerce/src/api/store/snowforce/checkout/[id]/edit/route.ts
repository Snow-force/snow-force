import type {AuthenticatedMedusaRequest,MedusaResponse} from "@medusajs/framework/http";
import {MedusaError} from "@medusajs/framework/utils";
import {z} from "zod";
import {withdrawCartTaxQuote} from "../../../../../../lib/tax-quote-withdrawal";
export function createCartEditPost(withdraw = withdrawCartTaxQuote) {
  return async function cartEditPost(req:AuthenticatedMedusaRequest,res:MedusaResponse){
    if(!z.object({}).strict().safeParse(req.body).success)throw new MedusaError(MedusaError.Types.INVALID_DATA,"Invalid cart edit request.");
    try { return res.json(await withdraw(req.scope,req.auth_context,req.params.id)); }
    catch (error) {
      // Medusa's global handler replaces every CONFLICT message with generic
      // idempotency guidance. Keep this specific business boundary explicit.
      if (error instanceof MedusaError && error.type === MedusaError.Types.CONFLICT) return res.status(409).json({ code: "checkout_locked", type: "conflict", message: "Check the current quote and payment before changing this cart." });
      throw error;
    }
  };
}
export const POST = createCartEditPost();
