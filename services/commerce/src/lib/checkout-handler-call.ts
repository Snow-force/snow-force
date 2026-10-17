import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import {CheckoutDraftChangedError} from "./checkout-draft-contract";

/** Compose existing authenticated handlers without another HTTP/auth roundtrip.
 * The request scope and identity are unchanged; only the validated command differs.
 */
export async function callCheckoutHandler(handler:(req:AuthenticatedMedusaRequest,res:MedusaResponse)=>Promise<unknown>,req:AuthenticatedMedusaRequest,body?:unknown){
  const child=Object.create(req) as AuthenticatedMedusaRequest;if(body!==undefined)Object.defineProperty(child,"body",{value:body});
  let status=200,value:unknown;
  const response={status(code:number){status=code;return response;},json(result:unknown){value=result;return response;}};
  await handler(child,response as MedusaResponse);
  if(status===409)throw new CheckoutDraftChangedError();
  if(status!==200)throw new MedusaError(MedusaError.Types.CONFLICT,"Receiving details changed. Review checkout again.");
  if(value===undefined)throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE,"Checkout review is unavailable.");return value;
}
