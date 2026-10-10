import type { IPaymentProvider, RefundPaymentInput, RefundPaymentOutput } from "@medusajs/framework/types";
import { AbstractPaymentProvider, ContainerRegistrationKeys, Modules, createMedusaContainer } from "@medusajs/framework/utils";
import { asValue } from "@medusajs/framework/awilix";
import Stripe from "stripe";
import { z } from "zod";
import { createRefundExecutorProvider } from "../../lib/refund-execution";
import { verifyNativeRefundReconciliation } from "../../lib/native-refund-reconciliation";
import { TaxRefundConflict } from "../../lib/tax-refund-contract";
import type { TaxRefundFundsReader } from "../../lib/tax-refund-funds";
import { registerRefundAdapter, requireConfiguredRefundAdapter } from "../../lib/refund-runtime";

type Options = Record<string, unknown> & { apiKey: string; webhookSecret: string };
type ProviderConstructor = {
  new (cradle: Record<string, unknown>, options: Options): IPaymentProvider;
  identifier: string;
};
// The installed provider's declarations include its private Stripe 15 SDK,
// whose ambient declarations conflict with our Stripe 23 SDK. Load its actual
// constructor through the SDK-independent Medusa contract and check its base
// class at runtime; keep the original methods and installed implementation.
const StripeProvider = z.object({
  default: z.custom<ProviderConstructor>(value =>
    typeof value === "function" && value.prototype instanceof AbstractPaymentProvider),
}).parse(require("@medusajs/payment-stripe/dist/services/stripe-provider")).default;

/** Refund callbacks only verify already-succeeded funds through GET.
 * Live callbacks also require the enabled, matching runtime registration. */
export default class SnowforceStripe extends StripeProvider {
  private readonly refundKey: string;
  private readonly refundConnection: unknown;
  private readonly refundCradle: Record<string, unknown>;

  constructor(cradle: Record<string, unknown>, options: Options) {
    super(cradle, options);
    this.refundKey = options.apiKey;
    this.refundConnection = cradle[ContainerRegistrationKeys.PG_CONNECTION];
    this.refundCradle = cradle;
    registerRefundAdapter(this, this.refundConnection, this.refundKey);
  }

  protected refundFundsReader(): TaxRefundFundsReader {
    const api = createRefundExecutorProvider(new Stripe(this.refundKey, {
      apiVersion: "2026-09-30.endive", timeout: 15000, maxNetworkRetries: 1,
    }), /^(sk|rk)_live_/.test(this.refundKey));
    return { livemode: api.livemode, account: api.account, intent: api.intent, refund: api.refund };
  }

  override async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(this.refundKey)) throw new TaxRefundConflict();
    const scope = createMedusaContainer();
    scope.register({ [ContainerRegistrationKeys.PG_CONNECTION]: asValue(this.refundConnection) });
    if (/^(sk|rk)_live_/.test(this.refundKey)) {
      scope.register({ [Modules.PAYMENT]: asValue({ paymentProviderService_: this.refundCradle.paymentProviderService }) });
      requireConfiguredRefundAdapter(scope);
    }
    return verifyNativeRefundReconciliation(scope, input, this.refundFundsReader());
  }
}
