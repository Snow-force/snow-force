import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { publicShopPolicy } from "../../../../lib/shop-policy";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.json({ policy: await publicShopPolicy(req.scope) });
}
