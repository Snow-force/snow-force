"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { CommerceAuthorizationError, CommerceRejectedError } from "./commerce-client";
import { CART_COOKIE_MAX_AGE, CART_COOKIE_NAME, signCartCookie } from "./cart-cookie";
import { cartSnapshot, type CartResult } from "./commerce-cart";
import { getCartContext as cartContext } from "./cart-context";
import { commerceId } from "./storefront";
import { getUsCommerceRegion, loadStorefrontCatalog } from "./storefront-repository";

const changeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add"), variantId: commerceId("variant"), quantity: z.number().int().min(1).max(99) }).strict(),
  z.object({ kind: z.literal("update"), itemId: commerceId("cali"), quantity: z.number().int().min(1).max(99) }).strict(),
  z.object({ kind: z.literal("remove"), itemId: commerceId("cali") }).strict(),
]);
const promotionSchema = z.object({ code: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/), remove: z.boolean().default(false) }).strict();
export async function applyShopPromotionAction(input: unknown): Promise<CartResult> {
  const parsed = promotionSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  try {
    const { repository, customer, cartId } = await cartContext();
    if (!cartId) return { status: "invalid" };
    const cart = await repository.get(cartId);
    if (!cart?.items.length) return { status: "invalid" };
    const regionId = await getUsCommerceRegion(customer.request);
    if (!regionId || cart.region_id !== regionId) return { status: "not-configured" };
    return { status: "ready", cart: cartSnapshot(await repository.promotion(cartId, parsed.data.code, parsed.data.remove)) };
  } catch (error) { return failed(error); }
}
function failed(error: unknown): CartResult {
  if (error instanceof CommerceAuthorizationError) return { status: "signed-out" };
  if (error instanceof CommerceRejectedError) return { status: "rejected" };
  return { status: "unavailable" };
}
export async function getShopCartAction(): Promise<CartResult> {
  try { const { repository, cartId } = await cartContext(); const cart = cartId ? await repository.get(cartId) : null; return { status: "ready", cart: cart ? cartSnapshot(cart) : null }; }
  catch (error) { return failed(error); }
}
export async function changeShopCartAction(input: unknown): Promise<CartResult> {
  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  try {
    const { repository, customer, secret, cartId } = await cartContext();
    const change = parsed.data;
    let cart = cartId ? await repository.get(cartId) : null;
    if (change.kind === "add") {
      const catalog = await loadStorefrontCatalog(customer.request);
      if (!catalog.regionId) return { status: "not-configured" };
      const variant = catalog.products.flatMap((product) => product.variants).find((item) => item.id === change.variantId);
      if (!variant?.available || (variant.availableQuantity !== null && variant.availableQuantity < change.quantity)) return { status: "rejected" };
      if (!cart) {
        cart = await repository.create(catalog.regionId);
        (await cookies()).set(CART_COOKIE_NAME, signCartCookie(cart.id, customer.userId, secret), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: CART_COOKIE_MAX_AGE });
      }
      if (cart.region_id !== catalog.regionId) return { status: "not-configured" };
      cart = await repository.add(cart.id, change.variantId, change.quantity);
    } else {
      if (!cart || !cart.items.some((item) => item.id === change.itemId)) return { status: "invalid" };
      const regionId = await getUsCommerceRegion(customer.request);
      if (!regionId || cart.region_id !== regionId) return { status: "not-configured" };
      cart = change.kind === "update" ? await repository.update(cart.id, change.itemId, change.quantity) : await repository.remove(cart.id, change.itemId);
    }
    return { status: "ready", cart: cartSnapshot(cart) };
  } catch (error) { return failed(error); }
}
