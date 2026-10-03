import type { MedusaContainer } from "@medusajs/framework/types";
import { z } from "zod";
import { checkoutCartSchema } from "./checkout-policy";
import { discountedItemCents } from "./shipping-policy";
import { readHistoricalNativeTaxQuote } from "./tax-quote-ledger";

/** Fee exclusion for delivery display needs authentic private evidence and exact native money, even after expiry. Payment separately requires current reviews. */
export async function verifiedCartMerchandiseCents(raw: unknown, scope: MedusaContainer) {
  const cart = z.object({ item_total: z.unknown(), item_tax_total: z.unknown(), items: z.array(z.object({ variant_id: z.string().nullable() })).optional() }).parse(raw);
  if (!cart.items?.some(item => item.variant_id === null)) return discountedItemCents(cart.item_total, cart.item_tax_total);
  const proof = await readHistoricalNativeTaxQuote(checkoutCartSchema.parse(raw), scope);
  return proof.quote.amounts.merchandise_cents;
}
