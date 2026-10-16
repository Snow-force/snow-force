import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { ILockingModule, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { z } from "zod";
import { checkoutCartSchema, checkoutFields, type CheckoutCart } from "../../../../../../lib/checkout-policy";
import { cancelUnpaidCartPayment, previewCartCancellation, type CancellationResult } from "../../../../../../lib/payment-cancellation";
import { recoverCanceledCartPayment } from "../../../../../../lib/payment-recovery";
import { withdrawCartTaxQuote } from "../../../../../../lib/tax-quote-withdrawal";

const input = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }).strict();
async function owned(req: AuthenticatedMedusaRequest) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "cart", fields: checkoutFields, filters: { id: req.params.id } });
  if (!data[0] || data[0].customer_id !== req.auth_context.actor_id) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found.");
  return checkoutCartSchema.parse(data[0]);
}
type Dependencies = {
  preview: typeof previewCartCancellation;
  cancel: typeof cancelUnpaidCartPayment;
  recover: typeof recoverCanceledCartPayment;
  withdraw: typeof withdrawCartTaxQuote;
};
const defaults: Dependencies = { preview: previewCartCancellation, cancel: cancelUnpaidCartPayment, recover: recoverCanceledCartPayment, withdraw: withdrawCartTaxQuote };
async function locked<T>(req: AuthenticatedMedusaRequest, operation: (cart: CheckoutCart, scope: MedusaContainer, signals: readonly (AbortSignal | undefined)[]) => Promise<T>) {
  // Ownership before acquiring locks or reading any provider binding.
  await owned(req);
  const locking = req.scope.resolve<ILockingModule>(Modules.LOCKING);
  return locking.execute(`snowforce-checkout:${req.params.id}`, outer => locking.execute(req.params.id, async native => {
    const cart = await owned(req), signals = [outer, native];
    if (signals.some(signal => signal?.aborted)) throw new MedusaError(MedusaError.Types.CONFLICT, "Check checkout status.");
    return operation(cart, req.scope, signals);
  }, { timeout: 15, expire: 120 }), { timeout: 15, expire: 120 });
}
export function createCancellationRoutes(dependencies: Dependencies = defaults) {
  return {
    async GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
      const result = await locked(req, (cart, scope, signals) => cart.completed_at ? Promise.resolve<CancellationResult>({ status: "blocked", code: "payment-review" }) : dependencies.preview(cart, scope, signals));
      res.json(result);
    },
    async POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
      const parsed = input.safeParse(req.body);
      if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Confirm the current unpaid checkout before canceling.");
      const result = await locked(req, async (cart, scope, signals): Promise<CancellationResult> => {
        if (cart.completed_at) return { status: "blocked", code: "payment-review" };
        const canceled = await dependencies.cancel(cart, scope, parsed.data.token, signals);
        if (canceled.status !== "canceled") return canceled;
        // Remote cancellation alone never unlocks the cart. Preserve all native
        // sessions/history and use the existing provider-verified recovery.
        try {
          const current = await owned(req);
          const recovered = await dependencies.recover(current, scope, signals);
          return recovered.unlocked ? canceled : { status: "pending", code: "recovery-pending" };
        } catch { return { status: "pending", code: "recovery-pending" }; }
      });
      if (result.status !== "canceled") return res.json(result);
      // Withdrawal acquires the same leases itself. A concurrent replacement
      // payment between these phases blocks withdrawal and any subsequent edit.
      try {
        await dependencies.withdraw(req.scope, req.auth_context, req.params.id);
        return res.json({ status: "editable" });
      } catch { return res.json({ status: "pending", code: "recovery-pending" }); }
    },
  };
}
export const { GET, POST } = createCancellationRoutes();
