import "server-only";
import { cookies } from "next/headers";
import { getCommerceCustomerSession } from "./commerce-auth";
import { CART_COOKIE_NAME, readCartCookie } from "./cart-cookie";
import { createCartRepository } from "./commerce-cart";

export async function getCartContext() {
  const customer = await getCommerceCustomerSession();
  const secret = process.env.SHOP_CART_COOKIE_SECRET ?? "";
  if (!/^[a-f0-9]{64,}$/i.test(secret)) throw new Error("Shop cart configuration is unavailable.");
  const cartId = readCartCookie((await cookies()).get(CART_COOKIE_NAME)?.value, customer.userId, secret);
  return { customer, secret, cartId, repository: createCartRepository(customer.request, customer) };
}
