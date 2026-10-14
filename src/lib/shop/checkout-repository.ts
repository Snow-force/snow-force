import "server-only";
import { z } from "zod";
import { nativeCartSchema, CART_FIELDS, prepareCartEdit } from "./commerce-cart";
import { CommerceAuthorizationError, type CommerceRequest } from "./commerce-client";
import { checkoutRecoverySchema, checkoutStatusSchema, checkoutQuoteResponseSchema, nativeCheckoutAddress, type CheckoutAddress } from "./checkout";
import { commerceId, usdAmount } from "./storefront";

const nativeAddress = z.object({ first_name: z.string().nullable(), last_name: z.string().nullable(), address_1: z.string().nullable(), address_2: z.string().nullable(), city: z.string().nullable(), province: z.string().nullable(), postal_code: z.string().nullable(), country_code: z.string().nullable(), phone: z.string().nullable() });
export const checkoutNativeCartSchema = nativeCartSchema.extend({ shipping_address: nativeAddress.nullable().default(null), shipping_methods: z.array(z.object({ shipping_option_id: commerceId("so"), name: z.string(), amount: usdAmount })) });
export const CHECKOUT_FIELDS = `${CART_FIELDS},shipping_address.first_name,shipping_address.last_name,shipping_address.address_1,shipping_address.address_2,shipping_address.city,shipping_address.province,shipping_address.postal_code,shipping_address.country_code,shipping_address.phone,shipping_methods.shipping_option_id,shipping_methods.name,shipping_methods.amount`;
const statusResponseSchema = z.union([checkoutStatusSchema.options[0].extend({ cart: checkoutNativeCartSchema }), checkoutStatusSchema.options[1], checkoutStatusSchema.options[2], checkoutStatusSchema.options[3]]);
export function createCheckoutRepository(request: CommerceRequest, customer: { customerId: string; token: string; email: string }, cartId: string) {
  const id = commerceId("cart").parse(cartId);
  const path = `/store/carts/${id}`;
  const options = { token: customer.token };
  const cartResponse = z.object({ cart: checkoutNativeCartSchema });
  async function read() {
    const { cart } = await request(`${path}?fields=${CHECKOUT_FIELDS}`, cartResponse, options);
    if (cart.customer?.id !== customer.customerId) throw new CommerceAuthorizationError();
    return cart;
  }
  return {
    read,
    async status() { const result = await request(`/store/snowforce/checkout/${id}`, statusResponseSchema, options); if (result.status === "review" && result.cart.customer?.id !== customer.customerId) throw new CommerceAuthorizationError(); return result; },
    async shippingOptions() {
      const schema = z.object({ shipping_options: z.array(z.object({ id: commerceId("so"), name: z.string(), calculated_price: z.object({ currency_code: z.literal("usd"), calculated_amount: usdAmount }).nullable() })) });
      const result = await request(`/store/snowforce/checkout/${id}/shipping-options`, schema, options);
      return result.shipping_options.flatMap((option) => option.calculated_price ? [{ id: option.id, name: option.name, price: option.calculated_price.calculated_amount }] : []);
    },
    async address(address: CheckoutAddress) {
      const shipping = nativeCheckoutAddress(address);
      await prepareCartEdit(request, customer.token, id);
      await request(`${path}?fields=${CHECKOUT_FIELDS}`, cartResponse, { ...options, method: "POST", body: { email: customer.email, shipping_address: shipping, billing_address: shipping } });
    },
    async shipping(optionId: string) {
      const option_id = commerceId("so").parse(optionId);
      await prepareCartEdit(request, customer.token, id);
      await request(`${path}/shipping-methods?fields=${CHECKOUT_FIELDS}`, cartResponse, { ...options, method: "POST", body: { option_id } });
    },
    async quote() { return request(`/store/snowforce/checkout/${id}/quote`, checkoutQuoteResponseSchema, { ...options, method: "POST", body: {} }); },
    async payment(fingerprint: string, policyVersion: number) { return request(`/store/snowforce/checkout/${id}`, checkoutStatusSchema, { ...options, method: "POST", body: { kind: "prepare", fingerprint, policyVersion, agreed: true } }); },
    async complete() { return request(`/store/snowforce/checkout/${id}`, z.union([checkoutStatusSchema.options[1], checkoutStatusSchema.options[3]]), { ...options, method: "POST", body: { kind: "complete" } }); },
    async recover() { return request(`/store/snowforce/checkout/${id}`, checkoutRecoverySchema, { ...options, method: "POST", body: { kind: "recover" } }); },
  };
}
