import type {AuthenticatedMedusaRequest,MedusaResponse} from "@medusajs/framework/http";
import {previewCheckoutDraft} from "../../../../../../lib/checkout-draft-preview";
import {checkoutDraftRoute} from "../../../../../../lib/checkout-draft-route";
export const POST=checkoutDraftRoute(async(req:AuthenticatedMedusaRequest,res:MedusaResponse)=>res.json(await previewCheckoutDraft(req.scope,req.auth_context,req.params.id,req.body)));
