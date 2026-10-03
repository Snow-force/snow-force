import type { AuthenticatedMedusaRequest,MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";
import { normalizeCartTaxMoney } from "../../../../../../lib/tax-money-normalization";

export async function POST(req:AuthenticatedMedusaRequest,res:MedusaResponse){
  if(!z.object({}).strict().safeParse(req.body).success)throw new MedusaError(MedusaError.Types.INVALID_DATA,"Invalid cart normalization request.");
  const amounts=await normalizeCartTaxMoney(req.scope,req.auth_context,req.params.id);
  res.json({status:"normalized",...amounts,review_required:true});
}
