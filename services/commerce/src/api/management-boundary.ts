import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http";
import { assertSalesOperations, isManagementMode } from "../lib/operating-mode";
import { newcomerPolicy } from "../lib/newcomer-policy";

const financialAdminPaths = [
  "/admin/orders", "/admin/draft-orders", "/admin/payments", "/admin/payment-collections",
  "/admin/returns", "/admin/exchanges", "/admin/claims", "/admin/workflows-executions",
  "/admin/snowforce/payments", "/admin/snowforce/after-sales", "/admin/snowforce/tax/sales",
];
const within = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function useManagementBoundary(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction): void {
  if (!isManagementMode()) return next();
  // Verified customer linking and welcome-code issuance never create payments or orders.
  // Their route-specific customer authentication remains mandatory.
  if (req.method === "POST" && ["/store/snowforce/customer", "/store/snowforce/newcomer"].includes(req.path) && newcomerPolicy()) return next();
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (within(req.path, "/hooks/payment") || within(req.path, "/store/snowforce/checkout") ||
      (mutating && (within(req.path, "/store") || financialAdminPaths.some(prefix => within(req.path, prefix))))) {
    assertSalesOperations();
  }
  next();
}
