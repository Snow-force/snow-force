import { MedusaError } from "@medusajs/framework/utils";

export function isManagementMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.COMMERCE_OPERATING_MODE === "management" ||
    (env.NODE_ENV === "production" && env.COMMERCE_OPERATING_MODE !== "sales");
}

export function assertSalesOperations(): void {
  if (isManagementMode()) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "The shop is open for administration only. Sales and payment operations are disabled.");
  }
}
