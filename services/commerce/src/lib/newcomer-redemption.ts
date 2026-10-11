import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { z } from "zod";
import type { TaxQuoteConnection } from "./tax-quote-ledger";
import { assertNewcomerCartRules } from "./newcomer-cart-policy";

/** Native limits do not prevent two already-discounted carts completing together.
 * Reserve this welcome promotion for one cart atomically before authorization.
 * Retries of that same cart remain possible, including after a workflow failure. */
export async function reserveNewcomerRedemption(initialCart: unknown, cart: { id: string; customer_id: string | null }, scope: MedusaContainer, phase: "payment" | "complete" = "complete") {
  assertNewcomerCartRules(initialCart);
  const adjustment = z.object({ code: z.string().nullable().optional() });
  const initial = z.object({ items: z.array(z.object({ adjustments: z.array(adjustment).nullish() })).default([]), shipping_methods: z.array(z.object({ adjustments: z.array(adjustment).nullish() })).default([]) }).parse(initialCart);
  const codes = [...new Set([...initial.items, ...initial.shipping_methods].flatMap(item => item.adjustments ?? []).map(item => item.code).filter((code): code is string => typeof code === "string" && /^WELCOME-[A-F0-9]{32}$/.test(code)))];
  if (!codes.length) return;
  if (codes.length !== 1 || !/^WELCOME-[A-F0-9]{32}$/.test(codes[0]) || !cart.customer_id) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Review your welcome code.");
  const db = scope.resolve<TaxQuoteConnection>(ContainerRegistrationKeys.PG_CONNECTION);
  const result = await db.raw(`update commerce.promotion p set metadata=coalesce(p.metadata,'{}'::jsonb)||jsonb_build_object('snowforce_newcomer_cart',cast(? as text))
    from commerce.promotion_campaign c where p.code=? and p.campaign_id=c.id
    and p.deleted_at is null and c.deleted_at is null and p.status='active' and p.limit=1
    and p.metadata->>'snowforce_newcomer'='v1' and p.metadata->>'snowforce_customer_id'=?
    and ((p.used=0 and p.metadata->>'snowforce_newcomer_cart' is null and c.starts_at<=clock_timestamp() and c.ends_at>clock_timestamp())
      or (p.metadata->>'snowforce_newcomer_cart'=? and (cast(? as boolean) or (p.used=0 and c.starts_at<=clock_timestamp() and c.ends_at>clock_timestamp()))))
    returning p.id`, [cart.id, codes[0], cart.customer_id, cart.id, phase === "complete"]);
  if (result.rows.length !== 1) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Your welcome code is expired, used, or reserved for another cart.");
}
export async function reserveNewcomerPayment(cart: { id: string; customer_id: string | null; discount_total: number }, scope: MedusaContainer, resumingAttempt = false) {
  if (cart.discount_total <= 0) return;
  const query = scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "cart", fields: ["id", "customer_id", "items.unit_price", "items.compare_at_unit_price", "items.quantity", "items.is_discountable", "items.adjustments.code", "items.adjustments.amount", "shipping_methods.adjustments.code", "shipping_methods.adjustments.amount", "promotions.code"], filters: { id: cart.id } });
  const current = z.object({ id: z.literal(cart.id), customer_id: z.literal(cart.customer_id) }).parse(data[0]);
  await reserveNewcomerRedemption(data[0], current, scope, resumingAttempt ? "complete" : "payment");
}
