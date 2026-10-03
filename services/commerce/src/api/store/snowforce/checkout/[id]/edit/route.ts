import type {AuthenticatedMedusaRequest,MedusaResponse} from "@medusajs/framework/http";
import {MedusaError} from "@medusajs/framework/utils";
import {z} from "zod";
import {withdrawCartTaxQuote} from "../../../../../../lib/tax-quote-withdrawal";
export async function POST(req:AuthenticatedMedusaRequest,res:MedusaResponse){
  if(!z.object({}).strict().safeParse(req.body).success)throw new MedusaError(MedusaError.Types.INVALID_DATA,"Invalid cart edit request.");
  res.json(await withdrawCartTaxQuote(req.scope,req.auth_context,req.params.id));
}
