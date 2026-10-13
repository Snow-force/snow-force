import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http";
import { assertSalesOperations, isManagementMode } from "../lib/operating-mode";

const financialAdminPaths = [
  "/admin/orders", "/admin/draft-orders", "/admin/payments", "/admin/payment-collections",
  "/admin/returns", "/admin/exchanges", "/admin/claims", "/admin/workflows-executions",
  "/admin/snowforce/payments", "/admin/snowforce/after-sales", "/admin/snowforce/tax/sales",
];
const within = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
const cartPreparationPaths = [
  /^\/store\/snowforce\/customer$/,
  /^\/store\/carts$/,
  /^\/store\/carts\/cart_[A-Za-z0-9]+\/line-items(?:\/cali_[A-Za-z0-9]+)?$/,
  /^\/store\/carts\/cart_[A-Za-z0-9]+\/promotions$/,
  /^\/store\/snowforce\/checkout\/cart_[A-Za-z0-9]+\/edit$/,
];

function allowsCartPreparation(req: MedusaRequest): boolean {
  if (process.env.COMMERCE_OPERATING_MODE !== "management" || process.env.COMMERCE_CART_ENABLED !== "true") return false;
  // The normal customer authentication and cart ownership middleware still runs.
  // Payment preparation, cart completion, addresses/shipping and financial writes
  // are deliberately absent from this exact allowlist.
  return req.method === "POST" && cartPreparationPaths.some(path => path.test(req.path)) ||
    req.method === "DELETE" && cartPreparationPaths[3].test(req.path);
}

export function useManagementBoundary(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction): void {
  if (!isManagementMode()) return next();
  if (allowsCartPreparation(req)) return next();
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (within(req.path, "/hooks/payment") || within(req.path, "/store/snowforce/checkout") ||
      (mutating && (within(req.path, "/store") || financialAdminPaths.some(prefix => within(req.path, prefix))))) {
    assertSalesOperations();
  }
  next();
}
