import { MathBN, MedusaError, Modules } from "@medusajs/framework/utils";
import type { ComputeActionContext, IPromotionModuleService, MedusaContainer } from "@medusajs/framework/types";
import { z } from "zod";

export const isNewcomerCode = (code: unknown): code is string => typeof code === "string" && /^WELCOME-[A-F0-9]{32}$/.test(code);
const adjustment = z.object({ code: z.string().nullish(), amount: z.number().nonnegative().optional() }).passthrough();
const item = z.object({ unit_price: z.number().nonnegative(), compare_at_unit_price: z.number().nonnegative().nullish(), quantity: z.number().positive(), is_discountable: z.boolean().optional(), adjustments: z.array(adjustment).nullish() }).passthrough();
const cartSchema = z.object({ items: z.array(item), shipping_methods: z.array(z.object({ adjustments: z.array(adjustment).nullish() }).passthrough()).default([]), promotions: z.array(z.object({ code: z.string().nullish() })).default([]) });
const regularPrice = (line: z.infer<typeof item>) => line.is_discountable !== false && (line.compare_at_unit_price == null || line.compare_at_unit_price <= line.unit_price);

/** Custom rule context is derived from native cart prices, never request metadata. */
export function newcomerPromotionContext(value: unknown, requestedCodes: string[], action: string) {
  const cart = cartSchema.parse(value);
  const previous = cart.promotions.map(p => p.code).filter((code): code is string => typeof code === "string");
  const codes = action === "remove" ? previous.filter(code => !requestedCodes.includes(code)) : action === "replace" ? requestedCodes : [...previous, ...requestedCodes];
  const otherAdjustments = [...cart.items, ...cart.shipping_methods].some(line => line.adjustments?.some(a => !isNewcomerCode(a.code) && (a.amount ?? 0) > 0 && !(action === "remove" && requestedCodes.includes(a.code ?? ""))));
  return { snowforce_no_stacking: codes.every(isNewcomerCode) && !otherAdjustments ? "true" : "false",
    items: cart.items.map(line => ({ ...line, snowforce_regular_price: regularPrice(line) ? "true" : "false" })) };
}

export async function evaluateNewcomerContext(cart: ComputeActionContext, codes: string[], action: string, scope: MedusaContainer) {
  const context = newcomerPromotionContext(cart, codes, action);
  const previous = cartSchema.parse(cart).promotions.map(p => p.code);
  if (context.snowforce_no_stacking !== "true" || ![...codes, ...previous].some(isNewcomerCode)) return context;
  // Compute only automatic offers without previous adjustments; this is a read-only native evaluation.
  const automatic = await scope.resolve<IPromotionModuleService>(Modules.PROMOTION).computeActions([], {
    ...cart, snowforce_no_stacking: "false",
    items: cart.items?.map(line => ({ ...line, adjustments: [] })),
    shipping_methods: cart.shipping_methods?.map(line => ({ ...line, adjustments: [] })),
  });
  if (automatic.some(a => (a.action === "addItemAdjustment" || a.action === "addShippingMethodAdjustment") && MathBN.gt(a.amount, 0))) context.snowforce_no_stacking = "false";
  return context;
}

/** Recheck actual native adjustments before payment and completion, including automatic offers. */
export function assertNewcomerCartRules(value: unknown) {
  // Ordinary carts do not depend on welcome-offer pricing fields.
  const probe = z.object({ items: z.array(z.object({ adjustments: z.array(adjustment).nullish() })).default([]), shipping_methods: z.array(z.object({ adjustments: z.array(adjustment).nullish() })).default([]) }).parse(value);
  if (![...probe.items, ...probe.shipping_methods].some(line => line.adjustments?.some(a => isNewcomerCode(a.code)))) return;
  const cart = cartSchema.parse(value);
  const fail = () => { throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Welcome codes give 10% off regular-price merchandise only and cannot be combined with other promotions."); };
  if (cart.promotions.some(p => p.code && !isNewcomerCode(p.code))) fail();
  if (cart.shipping_methods.some(line => line.adjustments?.some(a => isNewcomerCode(a.code)))) fail();
  for (const line of [...cart.items, ...cart.shipping_methods]) {
    if (line.adjustments?.some(a => !isNewcomerCode(a.code) && (a.amount ?? 0) > 0)) fail();
  }
  for (const line of cart.items) {
    const applied = line.adjustments?.filter(a => isNewcomerCode(a.code)) ?? [];
    if (!applied.length) continue;
    if (!regularPrice(line) || applied.some(a => a.amount === undefined) || applied.reduce((sum, a) => sum + (a.amount ?? 0), 0) > line.unit_price * line.quantity * 0.1 + 0.005) fail();
  }
}
