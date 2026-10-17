import type {AuthenticatedMedusaRequest,MedusaResponse} from "@medusajs/framework/http";
import {MedusaError} from "@medusajs/framework/utils";
import {z} from "zod";
import {assertSalesOperations} from "./operating-mode";
import {OwnedTaxCartSnapshotMissingError} from "./tax-cart-sql";
import {CheckoutDraftChangedError} from "./checkout-draft-contract";

export function checkoutDraftRoute(action:(req:AuthenticatedMedusaRequest,res:MedusaResponse)=>Promise<unknown>){
  return async(req:AuthenticatedMedusaRequest,res:MedusaResponse)=>{
    assertSalesOperations();
    if(process.env.COMMERCE_CHECKOUT_DRAFTS!=="true"||process.env.COMMERCE_TAX_POLICY_CONFIRMED!=="true")throw new MedusaError(MedusaError.Types.NOT_ALLOWED,"Draft checkout is not enabled.");
    if(req.auth_context?.actor_type!=="customer"||!/^cus_[A-Za-z0-9]+$/.test(req.auth_context.actor_id))throw new MedusaError(MedusaError.Types.UNAUTHORIZED,"Sign in through SnowForce.");
    res.setHeader("Cache-Control","no-store");
    try{return await action(req,res);}catch(error){
      if(error instanceof z.ZodError)return res.status(400).json({type:"invalid_data",code:"invalid_checkout_draft",message:"Review the receiving details."});
      if(error instanceof OwnedTaxCartSnapshotMissingError||error instanceof MedusaError&&error.type===MedusaError.Types.NOT_FOUND)return res.status(404).json({type:"not_found",message:"Cart not found."});
      if(error instanceof MedusaError&&error.type!==MedusaError.Types.CONFLICT)throw error;
      return res.status(409).json(error instanceof CheckoutDraftChangedError?{type:"conflict",code:"checkout_details_changed",message:"Review current receiving details and total before continuing."}:{type:"conflict",code:"checkout_estimate_unavailable",message:"The estimate could not be verified. Your receiving draft is kept."});
    }
  };
}
