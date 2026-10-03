import type {AuthenticatedMedusaRequest,MedusaResponse} from "@medusajs/framework/http";
import {MedusaError} from "@medusajs/framework/utils";
import {z} from "zod";
import {refreshCartTaxQuote} from "../../../../../../lib/tax-quote-refresh";
export async function POST(req:AuthenticatedMedusaRequest,res:MedusaResponse){
  if(!z.object({}).strict().safeParse(req.body).success)throw new MedusaError(MedusaError.Types.INVALID_DATA,"Invalid tax quote request.");
  res.json(await refreshCartTaxQuote(req.scope,req.auth_context,req.params.id));
}
