import "server-only";
import { z } from "zod";
import { CommerceAuthorizationError, CommerceCheckoutLockedError, CommerceNotFoundError, CommerceRejectedError, CommerceSalesDisabledError, type CommerceRequest } from "./commerce-client";
import { commerceId, safeProductImage, usdAmount } from "./storefront";
import { checkoutRecoverySchema } from "./checkout";

export const nativeCartSchema = z.object({
  id: commerceId("cart"), currency_code: z.literal("usd"), customer: z.object({ id: commerceId("cus") }).nullable(), region_id: commerceId("reg").nullable(), completed_at: z.string().nullable(),
  total: usdAmount, subtotal: usdAmount, tax_total: usdAmount, shipping_total: usdAmount, discount_total: usdAmount,
  promotions: z.array(z.object({ code: z.string() })).optional(),
  items: z.array(z.object({ id: commerceId("cali"), variant_id: commerceId("variant").nullable(), product_handle: z.string().nullable(), product_title: z.string().nullable(), title: z.string(), variant_title: z.string().nullable(), thumbnail: z.string().nullable(), quantity: z.number().int().min(1).max(9999), unit_price: usdAmount, total: usdAmount })),
});
export type NativeCart = z.infer<typeof nativeCartSchema>;
export type CommerceCart = { items: { id: string; name: string; variant: string; slug: string | null; image: string; quantity: number; unitPrice: number; total: number }[]; total: number; subtotal: number; taxTotal: number; shippingTotal: number; discountTotal: number; promotionCodes?: string[] };
export type CartResult = { status: "ready"; cart: CommerceCart | null } | { status: "signed-out" | "unavailable" | "not-configured" | "sales-disabled" | "rejected" | "invalid" | "checkout-locked" };
const responseSchema = z.object({ cart: nativeCartSchema });
export const CART_FIELDS = "id,currency_code,customer.id,region_id,completed_at,total,subtotal,tax_total,shipping_total,discount_total,promotions.code,items.id,items.variant_id,items.product_handle,items.product_title,items.title,items.variant_title,items.thumbnail,items.quantity,items.unit_price,items.total";
export async function prepareCartEdit(request: CommerceRequest, token: string, cartId: string) {
  const id = commerceId("cart").parse(cartId);
  const edit = () => request(`/store/snowforce/checkout/${id}/edit`, z.object({ status: z.literal("editable"), quote_removed: z.boolean(), review_required: z.literal(true) }).strict(), { token, method: "POST", body: {} });
  try { await edit(); }
  catch (error) {
    if (!(error instanceof CommerceCheckoutLockedError)) throw error;
    // Recovery reads Stripe and retires only verified canceled sessions. It
    // cannot cancel, confirm, capture or refund any payment.
    const recovered = await request(`/store/snowforce/checkout/${id}`, checkoutRecoverySchema, { token, method: "POST", body: { kind: "recover" } }).catch((recoveryError: unknown) => {
      // Authorized or completed native payment evidence can reject recovery.
      // Preserve the original checkout diagnosis rather than blaming inventory.
      if (recoveryError instanceof CommerceRejectedError && !(recoveryError instanceof CommerceSalesDisabledError)) throw error;
      throw recoveryError;
    });
    if (recovered.status !== "recovered" || !recovered.unlocked) throw error;
    // Recovery is NOT edit authorization: a new payment or unresolved quote
    // must still block the one fresh edit check before any item mutation.
    await edit();
  }
}
export function assertCartOwner(cart: NativeCart, customerId: string) {
  if (cart.customer?.id !== customerId) throw new CommerceAuthorizationError();
  if (cart.completed_at) throw new CommerceRejectedError();
}
export function cartSnapshot(cart: NativeCart): CommerceCart {
  return { items: cart.items.map((item) => ({ id: item.id, name: item.product_title ?? item.title, variant: item.variant_title ?? "", slug: item.product_handle && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.product_handle) ? item.product_handle : null, image: safeProductImage(item.thumbnail) ?? "/shop/product-placeholder.svg", quantity: item.quantity, unitPrice: item.unit_price, total: item.total })), total: cart.total, subtotal: cart.items.reduce((cents, item) => cents + Math.round(item.unit_price * 100) * item.quantity, 0) / 100, taxTotal: cart.tax_total, shippingTotal: cart.shipping_total, discountTotal: cart.discount_total, promotionCodes: (cart.promotions ?? []).map(promotion => promotion.code) };
}
export function createCartRepository(request: CommerceRequest, customer: { customerId: string; token: string }) {
  const options = { token: customer.token };
  const path = (cartId: string, suffix = "") => `/store/carts/${commerceId("cart").parse(cartId)}${suffix}?fields=${CART_FIELDS}`;
  const checked = (cart: NativeCart) => { assertCartOwner(cart, customer.customerId); return cart; };
  return {
    async promotion(cartId: string, code: string, remove = false) {
      const parsed = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/).parse(code);
      const target = path(cartId, "/promotions");
      await prepareCartEdit(request, customer.token, cartId);
      const cart = checked((await request(target, responseSchema, { ...options, method: remove ? "DELETE" : "POST", body: { promo_codes: [parsed] } })).cart);
      if (!remove && !cart.promotions?.some(promotion => promotion.code === parsed)) throw new CommerceRejectedError();
      return cart;
    },
    async get(cartId: string) { try { const cart = (await request(path(cartId), responseSchema, options)).cart; if (cart.customer?.id !== customer.customerId) throw new CommerceAuthorizationError(); return cart.completed_at ? null : cart; } catch (error) { if (error instanceof CommerceNotFoundError) return null; throw error; } },
    async create(regionId: string) { return checked((await request(`/store/carts?fields=${CART_FIELDS}`, responseSchema, { ...options, method: "POST", body: { region_id: commerceId("reg").parse(regionId), currency_code: "usd" } })).cart); },
    async add(cartId: string, variantId: string, quantity: number) { const target = path(cartId, "/line-items"), body = { variant_id: commerceId("variant").parse(variantId), quantity: z.number().int().min(1).max(99).parse(quantity) }; await prepareCartEdit(request, customer.token, cartId); return checked((await request(target, responseSchema, { ...options, method: "POST", body })).cart); },
    async update(cartId: string, itemId: string, quantity: number) { const target = path(cartId, `/line-items/${commerceId("cali").parse(itemId)}`), body = { quantity: z.number().int().min(1).max(99).parse(quantity) }; await prepareCartEdit(request, customer.token, cartId); return checked((await request(target, responseSchema, { ...options, method: "POST", body })).cart); },
    async remove(cartId: string, itemId: string) { const target = path(cartId, `/line-items/${commerceId("cali").parse(itemId)}`); await prepareCartEdit(request, customer.token, cartId); const result = await request(target, responseSchema, { ...options, method: "POST", body: { quantity: 0 } }); return checked(result.cart); },
  };
}
