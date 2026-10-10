import { createHash } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { z } from "zod";
import { isManagementMode } from "./operating-mode";
import { TaxRefundConflict } from "./tax-refund-contract";

type Adapter = { fingerprint: string; livemode: boolean };
const adapters = new WeakMap<object, Adapter & { connection: object }>();
const connectionObject = (value: unknown): value is object => value !== null && (typeof value === "object" || typeof value === "function");
const fingerprint = (key: string) => createHash("sha256").update(key).digest("hex");

/** The installed GET-only adapter records its actual native database cradle.
 * A flag alone cannot authorize a remote refund followed by a stock provider. */
export function registerRefundAdapter(provider: object, connection: unknown, key: string): void {
  if (connectionObject(connection) && /^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(key)) {
    adapters.set(provider, { connection, fingerprint: fingerprint(key), livemode: /^(sk|rk)_live_/.test(key) });
  }
}
export function configuredRefundAdapter(scope: MedusaContainer, env: NodeJS.ProcessEnv = process.env): Adapter | null {
  if (env.COMMERCE_REFUND_EXECUTION_ENABLED !== "true" || isManagementMode(env) ||
      !/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(env.COMMERCE_STRIPE_API_KEY ?? "") ||
      !/^whsec_[A-Za-z0-9]+$/.test(env.COMMERCE_STRIPE_WEBHOOK_SECRET ?? "")) return null;
  // Check the instance that Medusa will actually call, rather than an adapter
  // that happened to be constructed for this database earlier in the process.
  try {
    const connection: unknown = scope.resolve(ContainerRegistrationKeys.PG_CONNECTION);
    if (!connectionObject(connection)) return null;
    const module = z.object({ paymentProviderService_: z.unknown() }).parse(scope.resolve(Modules.PAYMENT));
    const owner = module.paymentProviderService_;
    const { retrieveProvider } = z.object({ retrieveProvider: z.custom<(id: string) => unknown>(value => typeof value === "function") }).parse(owner);
    const provider = retrieveProvider.call(owner, "pp_stripe_stripe");
    if (!connectionObject(provider)) return null;
    const adapter = adapters.get(provider);
    return adapter && adapter.connection === connection && adapter.fingerprint === fingerprint(env.COMMERCE_STRIPE_API_KEY!) ? adapter : null;
  } catch {
    return null;
  }
}
export function requireConfiguredRefundAdapter(scope: MedusaContainer): Adapter {
  const adapter = configuredRefundAdapter(scope);
  if (!adapter) throw new TaxRefundConflict();
  return adapter;
}
