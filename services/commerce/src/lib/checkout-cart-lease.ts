import { AsyncLocalStorage } from "node:async_hooks";
import type { ILockingModule, MedusaContainer } from "@medusajs/framework/types";
import { MedusaError, Modules } from "@medusajs/framework/utils";

type Signals = readonly (AbortSignal | undefined)[];
type Lease = { locking: ILockingModule; cartId: string; signals: Signals; closed: boolean; parent?: Lease };
const currentLease = new AsyncLocalStorage<Lease>();
function assertActive(signals: Signals) {
  if (signals.some(signal => signal?.aborted)) throw new MedusaError(MedusaError.Types.CONFLICT, "Checkout lease ended. Review the current cart.");
}

/** Share the same live checkout/native leases only within one awaited cart operation.
 * No customer state is cached; every caller still performs its own fresh source checks.
 */
export async function withCheckoutCartLease<T>(scope: MedusaContainer, cartId: string, action: (signals: Signals) => Promise<T>, signals: Signals = []): Promise<T> {
  assertActive(signals);
  const locking = scope.resolve<ILockingModule>(Modules.LOCKING), inherited = currentLease.getStore();
  let matching = inherited;
  while (matching && (matching.locking !== locking || matching.cartId !== cartId)) matching = matching.parent;
  if (matching) {
    if (matching.closed) throw new MedusaError(MedusaError.Types.CONFLICT, "Checkout lease ended. Review the current cart.");
    const combined = [...matching.signals, ...signals];
    assertActive(combined);
    const result = await action(combined);
    assertActive(combined);
    return result;
  }
  return locking.execute(`snowforce-checkout:${cartId}`, outer => locking.execute(cartId, async native => {
    const lifetime = new AbortController(), combined = [...(inherited?.signals ?? []), ...signals, outer, native, lifetime.signal];
    const lease = { locking, cartId, signals: combined, closed: false, parent: inherited };
    assertActive(combined);
    try {
      return await currentLease.run(lease, async () => {
        const result = await action(combined);
        assertActive(combined);
        return result;
      });
    } finally { lease.closed = true; lifetime.abort(); }
  }, { timeout: 15, expire: 120 }), { timeout: 15, expire: 120 });
}
