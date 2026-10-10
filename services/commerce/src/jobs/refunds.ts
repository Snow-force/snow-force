import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { configuredRefundAdapter } from "../lib/refund-runtime";
import { processRefundExecution } from "../lib/refund-execution";
import { processTaxRefund } from "../lib/tax-refund-worker";

export default async function refundsJob(container: MedusaContainer) {
  if (!configuredRefundAdapter(container)) return;
  for (const worker of [processRefundExecution, processTaxRefund]) {
    for (let index = 0; index < 10; index++) {
      const result = await worker(container);
      if (!result) break;
      if (result.status === "reconcile_required") container.resolve(ContainerRegistrationKeys.LOGGER).error(`Refund task ${result.id} needs reconciliation.`);
    }
  }
}
export const config = { name: "snowforce-refunds", schedule: "*/2 * * * *" };
