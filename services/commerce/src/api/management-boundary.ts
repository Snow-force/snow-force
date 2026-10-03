import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http";
import { assertSalesOperations, isManagementMode } from "../lib/operating-mode";

const financialAdminPaths = [
  "/admin/orders", "/admin/draft-orders", "/admin/payments", "/admin/payment-collections",
  "/admin/returns", "/admin/exchanges", "/admin/claims", "/admin/workflows-executions",
  "/admin/snowforce/payments", "/admin/snowforce/after-sales", "/admin/snowforce/tax/sales",
];
const within = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function useManagementBoundary(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction): void {
  if (!isManagementMode()) return next();
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (within(req.path, "/hooks/payment") || within(req.path, "/store/snowforce/checkout") ||
      (mutating && (within(req.path, "/store") || financialAdminPaths.some(prefix => within(req.path, prefix))))) {
    assertSalesOperations();
  }
  next();
}
