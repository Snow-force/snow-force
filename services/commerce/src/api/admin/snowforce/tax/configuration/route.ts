import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { adminTaxConfiguration,changeTaxConfiguration } from "../../../../../lib/tax-configuration";
export async function GET(req:AuthenticatedMedusaRequest,res:MedusaResponse){res.setHeader("Cache-Control","private, no-store");res.json(await adminTaxConfiguration(req.scope,req.auth_context));}
export async function POST(req:AuthenticatedMedusaRequest,res:MedusaResponse){res.setHeader("Cache-Control","private, no-store");res.json(await changeTaxConfiguration(req.scope,req.auth_context,req.body));}
