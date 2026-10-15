import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { ILockingModule, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { completeCartWorkflow, createPaymentCollectionForCartWorkflow } from "@medusajs/medusa/core-flows";
import { z } from "zod";
import { assertCheckoutReady, assertPaymentMatches, assertUsCheckoutRegion, checkoutCartSchema, checkoutFields, paymentStarted, type CheckoutCart } from "../../../../../lib/checkout-policy";
import { assertCartShippingCoverage } from "../../../../../lib/shipping-coverage";
import { acceptCheckoutPolicy, assertAcceptedShopPolicy, checkoutPolicyReview, policySigningConfigured } from "../../../../../lib/policy-consent";
import { recoverCanceledCartPayment } from "../../../../../lib/payment-recovery";
import { createDurableCartPayment, paymentCreationInterrupted } from "../../../../../lib/payment-creation";
import { assertCartProductTaxClassifications } from "../../../../../lib/tax-classification";
import { assertActiveStripeTaxSetup } from "../../../../../lib/tax-setup";
import { assertPersistedCartTaxQuote, readHistoricalNativeTaxQuote } from "../../../../../lib/tax-quote-ledger";
import { readReviewedTaxConfiguration } from "../../../../../lib/tax-configuration";
import { publicCartTaxQuote } from "../../../../../lib/tax-quote-refresh";
import { readPickupOffer, verifyPickupConfirmation } from "../../../../../lib/local-pickup";

async function ownedCart(req: AuthenticatedMedusaRequest) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "cart", fields: checkoutFields, filters: { id: req.params.id } });
  // Ownership is checked before parsing or returning any personal/provider information.
  if (!data[0] || data[0].customer_id !== req.auth_context.actor_id) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found.");
  return checkoutCartSchema.parse(data[0]);
}
async function completedOrder(req: AuthenticatedMedusaRequest) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "order_cart", fields: ["order.id", "order.display_id", "order.customer_id", "order.currency_code", "order.total"], filters: { cart_id: req.params.id } });
  const schema = z.object({ id: z.string(), display_id: z.number(), customer_id: z.literal(req.auth_context.actor_id), currency_code: z.literal("usd"), total: z.coerce.number().nonnegative() });
  const order = schema.parse(data[0]?.order);
  return { id: order.id, number: String(order.display_id), total: order.total };
}
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const cart = await ownedCart(req);
  if (cart.completed_at) return res.json({ status: "complete", order: await completedOrder(req) });
  const { payment_collection: _payment, customer_id: customerId, email: _email, metadata: _metadata, ...safeCart } = cart;
  const policyReview = await checkoutPolicyReview(cart, req.scope);
  const classificationsReady = await assertCartProductTaxClassifications(cart, req.scope).then(() => true, () => false);
  const setup = classificationsReady && process.env.COMMERCE_TAX_POLICY_CONFIRMED === "true" ? await assertActiveStripeTaxSetup(req.scope).catch(() => null) : null;
  const taxSetupReady = !!setup && await readReviewedTaxConfiguration(req.scope, setup).then(() => true, () => false);
  const historical = await readHistoricalNativeTaxQuote(cart, req.scope).catch(() => null);
  const quoteReady = !!setup && !!historical && await assertPersistedCartTaxQuote(cart, req.scope, setup, paymentStarted(cart) ? "review" : "create_payment").then(() => true, () => false);
  // Fee lines are removed from the merchandise list only after private evidence
  // proves their native amounts; the public quote presents them separately.
  const goods = historical ? safeCart.items.filter(item => historical.quote.lines.some(line => line.id === item.id)) : safeCart.items;
  const taxQuote = historical ? { ...publicCartTaxQuote(historical.quote), ready: quoteReady } : null;
  const pickupOffer = await readPickupOffer(req.scope).catch(() => null);
  const pickupSelected = !!pickupOffer && (() => { try { verifyPickupConfirmation(cart, pickupOffer); return true; } catch { return false; } })();
  // Quote and display amounts come from one read. Provider secrets never enter the review response.
  res.json({ status: "review", cart: { ...safeCart, items: goods, customer: { id: customerId } }, ...policyReview, taxQuote, pickupOffer, pickupSelected, paymentStarted: paymentStarted(cart), configured: taxSetupReady && !!policyReview.policy && policySigningConfigured() && !!process.env.COMMERCE_STRIPE_API_KEY && !!process.env.COMMERCE_STRIPE_WEBHOOK_SECRET });
}
const input = z.discriminatedUnion("kind", [z.object({ kind: z.literal("prepare"), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), policyVersion: z.number().int().positive(), agreed: z.literal(true) }).strict(), z.object({ kind: z.literal("complete") }).strict(), z.object({ kind: z.literal("recover") }).strict()]);
function assertCheckoutLease(...signals: (AbortSignal | undefined)[]) {
  if (signals.some((signal) => signal?.aborted)) throw new MedusaError(MedusaError.Types.CONFLICT, "Retry checkout.");
}
type PaymentFlows = {
  createCollection(scope: MedusaContainer, cartId: string): Promise<void>;
  createSession(scope: MedusaContainer, cart: CheckoutCart, signals: readonly (AbortSignal | undefined)[]): Promise<void>;
};
const nativePaymentFlows: PaymentFlows = {
  async createCollection(scope, cartId) { await createPaymentCollectionForCartWorkflow(scope).run({ input: { cart_id: cartId } }); },
  async createSession(scope, cart, signals) { await createDurableCartPayment(cart, scope, signals); },
};
export function createCheckoutPost(flows: PaymentFlows = nativePaymentFlows, recover = recoverCanceledCartPayment) {
  return async function checkoutPost(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
    const parsed = input.safeParse(req.body);
    if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid checkout request.");
    const locking = req.scope.resolve<ILockingModule>(Modules.LOCKING);
    const result = await locking.execute(`snowforce-checkout:${req.params.id}`, async (signal) => {
      let cart = await ownedCart(req);
      if (cart.completed_at) return { status: "complete", order: await completedOrder(req) };
      assertCheckoutLease(signal);
      if (parsed.data.kind === "recover") {
        // Recovery must remain available even when tax setup or policy consent
        // is unavailable. It cannot create, confirm, cancel or refund a payment.
        return locking.execute(cart.id, async (cartSignal) => {
          assertCheckoutLease(signal, cartSignal);
          cart = await ownedCart(req);
          if (cart.completed_at) return { status: "complete", order: await completedOrder(req) };
          await recover(cart, req.scope, [signal, cartSignal]);
          assertCheckoutLease(signal, cartSignal);
          cart = await ownedCart(req);
          if (cart.completed_at) return { status: "complete", order: await completedOrder(req) };
          return { status: "recovered", unlocked: !paymentStarted(cart) };
        }, { timeout: 15, expire: 120 });
      }
      assertCheckoutReady(cart, process.env.COMMERCE_TAX_POLICY_CONFIRMED === "true");
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
      const { data: regions } = await query.graph({ entity: "region", fields: ["currency_code", "countries.iso_2"], filters: { id: cart.region_id } });
      assertUsCheckoutRegion(regions[0]);
      await assertCartShippingCoverage(cart, req.scope);
      await assertCartProductTaxClassifications(cart, req.scope);
      const taxSetup = await assertActiveStripeTaxSetup(req.scope);
      await assertPersistedCartTaxQuote(cart, req.scope, taxSetup);
      if (!process.env.COMMERCE_STRIPE_API_KEY || !process.env.COMMERCE_STRIPE_WEBHOOK_SECRET) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Payments are being prepared.");
      if (parsed.data.kind === "prepare") {
        const preparation = parsed.data;
        const review = await checkoutPolicyReview(cart, req.scope);
        assertCheckoutLease(signal);
        if (!review.policy || review.policy.version !== preparation.policyVersion || review.fingerprint !== preparation.fingerprint) throw new MedusaError(MedusaError.Types.CONFLICT, "Review the updated cart and shop policy before paying.");
        if (!cart.payment_collection) {
          await flows.createCollection(req.scope, cart.id);
          assertCheckoutLease(signal);
          cart = await ownedCart(req);
        }
        // Collection creation locks cart.id itself. Acquire it only after that workflow,
        // then freeze native edits through consent persistence and session creation.
        return locking.execute(cart.id, async (cartSignal) => {
          assertCheckoutLease(signal, cartSignal);
          cart = await ownedCart(req);
          assertCheckoutLease(signal, cartSignal);
          assertCheckoutReady(cart, process.env.COMMERCE_TAX_POLICY_CONFIRMED === "true");
          const { data: lockedRegions } = await query.graph({ entity: "region", fields: ["currency_code", "countries.iso_2"], filters: { id: cart.region_id } });
          assertUsCheckoutRegion(lockedRegions[0]);
          await assertCartShippingCoverage(cart, req.scope);
          await assertCartProductTaxClassifications(cart, req.scope);
          const lockedSetup = await assertActiveStripeTaxSetup(req.scope, taxSetup.fingerprint);
          await assertPersistedCartTaxQuote(cart, req.scope, lockedSetup);
          assertCheckoutLease(signal, cartSignal);
          if (!cart.payment_collection) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Payment setup is unavailable.");
          await acceptCheckoutPolicy(cart, req.scope, preparation);
          assertCheckoutLease(signal, cartSignal);
          cart = await ownedCart(req);
          await assertAcceptedShopPolicy(cart, req.scope);
          await assertPersistedCartTaxQuote(cart, req.scope, lockedSetup);
          assertCheckoutLease(signal, cartSignal);
          if (!cart.payment_collection) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Payment setup is unavailable.");
          if (!paymentStarted(cart) || paymentCreationInterrupted(cart)) {
            await flows.createSession(req.scope, cart, [signal, cartSignal]);
            assertCheckoutLease(signal, cartSignal);
            cart = await ownedCart(req);
          }
          await assertAcceptedShopPolicy(cart, req.scope);
          assertCheckoutLease(signal, cartSignal);
          const paymentQuote = await assertPersistedCartTaxQuote(cart, req.scope, lockedSetup);
          assertCheckoutLease(signal, cartSignal);
          const session = assertPaymentMatches(cart, paymentQuote.receipt.total_cents);
          if (["authorized", "captured", "pending_authorization"].includes(session.status)) return { status: "processing" };
          const clientSecret = z.string().regex(/^pi_[a-zA-Z0-9]+_secret_[a-zA-Z0-9]+$/).parse(session.data?.client_secret);
          return { status: "payment", clientSecret, totalCents: paymentQuote.receipt.total_cents, currency: "usd" };
        }, { timeout: 15, expire: 120 });
      }
      await assertAcceptedShopPolicy(cart, req.scope);
      const completionQuote = await assertPersistedCartTaxQuote(cart, req.scope, taxSetup, "complete");
      assertCheckoutLease(signal);
      assertPaymentMatches(cart, completionQuote.receipt.total_cents);
      const { errors, transaction } = await completeCartWorkflow(req.scope).run({ input: { id: cart.id }, throwOnError: false });
      if (!transaction.hasFinished()) return { status: "processing" };
      if (errors?.length) {
        const error = errors[0].error;
        if ([MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR, MedusaError.Types.PAYMENT_REQUIRES_MORE_ERROR].includes(error?.type)) return { status: "processing" };
        throw new MedusaError(MedusaError.Types.CONFLICT, "Order needs an inventory or payment review.");
      }
      return { status: "complete", order: await completedOrder(req) };
    }, { timeout: 15, expire: 120 });
    res.json(result);
};
}
export const POST = createCheckoutPost();
