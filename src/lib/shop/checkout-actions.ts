"use server";

import { getCartContext } from "./cart-context";
import { CommerceAuthorizationError, CommerceRejectedError } from "./commerce-client";
import { cartSnapshot } from "./commerce-cart";
import { createCheckoutRepository } from "./checkout-repository";
import { checkoutAddressSchema, checkoutInputSchema, type CheckoutResult } from "./checkout";
import { getUsCommerceRegion } from "./storefront-repository";
import { syncOwnedMemberOrder } from "./order-sync";

async function context() {
  const { customer, cartId } = await getCartContext();
  return cartId ? { customer, repository: createCheckoutRepository(customer.request, customer, cartId) } : null;
}
function failed(error: unknown): CheckoutResult {
  if (error instanceof CommerceAuthorizationError) return { status: "signed-out" };
  if (error instanceof CommerceRejectedError) return { status: "rejected" };
  return { status: "unavailable" };
}
async function review(session: NonNullable<Awaited<ReturnType<typeof context>>>): Promise<CheckoutResult> {
  const { repository, customer } = session;
  const status = await repository.status();
  if (status.status === "complete") { await syncOwnedMemberOrder(customer, status.order.id); return status; }
  if (status.status !== "review") return { status: "processing" };
  const cart = status.cart;
  if (!cart.items.length) return { status: "empty" };
  const regionId = await getUsCommerceRegion(customer.request);
  if (!regionId || cart.region_id !== regionId) return { status: "not-configured" };
  const raw = cart.shipping_address;
  const parsed = checkoutAddressSchema.safeParse(raw ? { name: [raw.first_name, raw.last_name].filter(Boolean).join(" "), phone: raw.phone ?? "", address1: raw.address_1 ?? "", address2: raw.address_2 ?? "", city: raw.city ?? "", state: raw.province ?? "", postalCode: raw.postal_code ?? "", countryCode: raw.country_code?.toUpperCase() } : null);
  const publishableKey = process.env.NEXT_PUBLIC_COMMERCE_STRIPE_PUBLISHABLE_KEY ?? "";
  const options = parsed.success ? await repository.shippingOptions() : [];
  const selected = cart.shipping_methods.length === 1 ? cart.shipping_methods[0] : null;
  const selectedOptionId = selected && options.some((option) => option.id === selected.shipping_option_id && Math.round(option.price * 100) === Math.round(selected.amount * 100)) ? selected.shipping_option_id : null;
  return { ...status, configured: status.configured && /^pk_(test|live)_[a-zA-Z0-9]+$/.test(publishableKey), cart: cartSnapshot(cart), address: parsed.success ? parsed.data : null, options, selectedOptionId };
}
export async function getShopCheckoutAction(): Promise<CheckoutResult> {
  try { const session = await context(); return session ? await review(session) : { status: "empty" }; }
  catch (error) { return failed(error); }
}
export async function changeShopCheckoutAction(input: unknown): Promise<CheckoutResult> {
  const parsed = checkoutInputSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const change = parsed.data;
  try {
    const session = await context();
    if (!session) return { status: "empty" };
    const { repository } = session;
    const cart = await repository.read(); // Owner check before every mutation, including completion.
    if (change.kind === "recover") {
      const recovered = await repository.recover();
      if (recovered.status === "complete") {
        await syncOwnedMemberOrder(session.customer, recovered.order.id);
        return recovered;
      }
      const refreshed = await review(session);
      // Another browser can start a payment after the recovery lock is released.
      // Describe the fresh review, never claim that this newer payment was canceled.
      return refreshed.status === "review" ? { ...refreshed, paymentCheck: recovered.unlocked && !refreshed.paymentStarted ? "unlocked" : "active" } : refreshed;
    }
    if (change.kind === "complete") {
      const completed = await repository.complete();
      if (completed.status === "complete") await syncOwnedMemberOrder(session.customer, completed.order.id);
      return completed;
    }
    if (cart.completed_at) {
      const completed = await repository.status();
      if (completed.status !== "complete") return { status: "processing" };
      await syncOwnedMemberOrder(session.customer, completed.order.id);
      return completed;
    }
    const current = await review(session);
    if (current.status !== "review") return current;
    if (!current.configured) return { status: "not-configured" };
    if (change.kind === "address") {
      if (current.paymentStarted) return { status: "rejected" };
      await repository.address(change.address);
    } else if (change.kind === "shipping") {
      if (current.paymentStarted || !current.address || !current.options.some((option) => option.id === change.optionId)) return { status: "rejected" };
      await repository.shipping(change.optionId);
    } else if (change.kind === "quote") {
      if (current.paymentStarted || !current.address || !current.selectedOptionId) return { status: "rejected" };
      await repository.quote();
    } else {
      if (!current.address || !current.selectedOptionId || !current.taxQuote?.ready || current.fingerprint !== change.fingerprint || !current.policy || current.policy.version !== change.policyVersion || current.cart.total <= 0 || current.taxQuote.totalCents !== Math.round(current.cart.total * 100)) return { status: "rejected" };
      const payment = await repository.payment(change.fingerprint, change.policyVersion);
      if (payment.status !== "payment") return payment.status === "review" ? { status: "rejected" } : payment;
      if (payment.totalCents !== current.taxQuote.totalCents) return { status: "rejected" };
      return { status: "payment", clientSecret: payment.clientSecret, publishableKey: process.env.NEXT_PUBLIC_COMMERCE_STRIPE_PUBLISHABLE_KEY ?? "", total: payment.totalCents / 100 };
    }
    return await review(session);
  } catch (error) { return failed(error); }
}
