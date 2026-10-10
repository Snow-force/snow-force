import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { publicCollectionPromotions } from "../../../../lib/storefront-promotions";
export async function GET(req: MedusaRequest, res: MedusaResponse) { res.setHeader("Cache-Control", "no-store"); res.json(await publicCollectionPromotions(req.scope)); }
