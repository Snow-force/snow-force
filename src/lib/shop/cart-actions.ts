"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { CommerceAuthorizationError, CommerceCheckoutLockedError, CommerceRejectedError, CommerceSalesDisabledError } from "./commerce-client";
import { CART_COOKIE_MAX_AGE, CART_COOKIE_NAME, signCartCookie } from "./cart-cookie";
import { cartSnapshot, type CartResult } from "./commerce-cart";
import { getCartContext as cartContext } from "./cart-context";
import { commerceId } from "./storefront";
import { getUsCommerceRegion, loadPurchasableVariant } from "./storefront-repository";

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
  if (error instanceof CommerceSalesDisabledError) return { status: "sales-disabled" };
  if (error instanceof CommerceCheckoutLockedError) return { status: "checkout-locked" };
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
  let session: Awaited<ReturnType<typeof cartContext>> | undefined;
  try {
    session = await cartContext();
    const { repository, customer, secret, cartId } = session;
    const change = parsed.data;
    let cart = cartId ? await repository.get(cartId) : null;
    if (change.kind === "add") {
      const catalog = await loadPurchasableVariant(customer.request, change.variantId);
      if (!catalog.regionId) return { status: "not-configured" };
      const variant = catalog.variant;
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
  } catch (error) {
    if (error instanceof CommerceCheckoutLockedError && parsed.data.kind === "remove" && session?.cartId) {
      try { return { status: "checkout-locked", cancellation: await session.repository.cancellation(session.cartId), itemId: parsed.data.itemId }; }
      catch (previewError) { return previewError instanceof CommerceAuthorizationError ? failed(previewError) : failed(error); }
    }
    return failed(error);
  }
}

const cancelRemovalSchema = z.object({ itemId: commerceId("cali"), token: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }).strict();
const cancelPaymentSchema = cancelRemovalSchema.omit({ itemId: true });
export async function previewShopPaymentCancellationAction(): Promise<CartResult> {
  try {
    const { repository, cartId } = await cartContext();
    if (!cartId || !await repository.get(cartId)) return { status: "invalid" };
    return { status: "checkout-locked", cancellation: await repository.cancellation(cartId) };
  } catch (error) { return failed(error); }
}
export async function cancelUnpaidCartPaymentAction(input: unknown): Promise<CartResult> {
  const parsed = cancelPaymentSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  try {
    const { repository, customer, cartId } = await cartContext();
    if (!cartId) return { status: "invalid" };
    const cart = await repository.get(cartId);
    if (!cart) return { status: "invalid" };
    const regionId = await getUsCommerceRegion(customer.request);
    if (!regionId || cart.region_id !== regionId) return { status: "not-configured" };
    const cancellation = await repository.cancelPayment(cartId, parsed.data.token);
    if (cancellation.status !== "editable") return { status: "checkout-locked", cancellation };
    const fresh = await repository.get(cartId);
    return { status: "ready", cart: fresh ? cartSnapshot(fresh) : null };
  } catch (error) { return failed(error); }
}
export async function cancelUnpaidPaymentAndRemoveAction(input: unknown): Promise<CartResult> {
  const parsed = cancelRemovalSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  try {
    const { repository, customer, cartId } = await cartContext();
    if (!cartId) return { status: "invalid" };
    const cart = await repository.get(cartId);
    if (!cart) return { status: "invalid" };
    // A retried, completed deletion is a read, never a second cancellation.
    if (!cart.items.some(item => item.id === parsed.data.itemId)) return { status: "ready", cart: cartSnapshot(cart) };
    const regionId = await getUsCommerceRegion(customer.request);
    if (!regionId || cart.region_id !== regionId) return { status: "not-configured" };
    const canceled = await repository.cancelPayment(cartId, parsed.data.token);
    if (canceled.status !== "editable") return { status: "checkout-locked", cancellation: canceled, itemId: parsed.data.itemId };
    // Cancellation is not mutation authorization. The native edit fence runs
    // again inside remove, protecting a concurrent replacement checkout.
    return { status: "ready", cart: cartSnapshot(await repository.remove(cartId, parsed.data.itemId)) };
  } catch (error) { return failed(error); }
}
