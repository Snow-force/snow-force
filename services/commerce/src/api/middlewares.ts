import { authenticate, defineMiddlewares } from "@medusajs/framework/http";
import { requireOwnedCart, useCheckoutBoundary } from "./cart-ownership";
import { useAfterSalesBoundary } from "./after-sales-boundary";
import { useManagementBoundary } from "./management-boundary";
import { useFullCaptureBoundary } from "../lib/full-capture";

export default defineMiddlewares({ routes: [{
  matcher: "/store/*", methods: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"], middlewares: [useManagementBoundary],
}, {
  matcher: "/admin/*", methods: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"], middlewares: [useManagementBoundary],
}, {
  matcher: "/hooks/payment/*", methods: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"], middlewares: [useManagementBoundary],
}, {
  matcher: "/admin/payments/:id/capture", methods: ["POST"],
  middlewares: [useFullCaptureBoundary],
}, {
  matcher: "/admin/snowforce/after-sales/:id/refunds/:operation/execute", methods: ["POST"],
  middlewares: [authenticate("user", ["session", "bearer"])],
}, {
  matcher: "/store/snowforce/newcomer", methods: ["POST"],
  middlewares: [authenticate("customer", ["bearer"])],
}, {
  matcher: "/store/snowforce/customer", methods: ["POST"],
  middlewares: [authenticate("customer", ["bearer"], { allowUnregistered: true })],
}, {
  matcher: "/store/carts", methods: ["POST"],
  middlewares: [authenticate("customer", ["bearer"])],
}, {
  matcher: "/store/carts/:id*", methods: ["GET", "POST", "DELETE"],
  middlewares: [authenticate("customer", ["bearer"]), requireOwnedCart],
}, {
  matcher: "/store/snowforce/checkout/:id", methods: ["GET", "POST"],
  middlewares: [authenticate("customer", ["bearer"])],
}, {
  matcher: "/store/snowforce/checkout/:id/normalize", methods: ["POST"],
  middlewares: [authenticate("customer", ["bearer"]), requireOwnedCart],
}, {
  matcher: "/store/snowforce/checkout/:id/edit", methods: ["POST"],
  middlewares: [authenticate("customer", ["bearer"])],
}, {
  matcher: "/store/snowforce/checkout/:id/cancel", methods: ["GET", "POST"],
  middlewares: [authenticate("customer", ["bearer"])],
}, {
  matcher: "/store/snowforce/checkout/:id/details", methods: ["POST"],
  middlewares: [authenticate("customer", ["bearer"])],
}, {
  matcher: "/store/snowforce/checkout/:id/quote", methods: ["POST"],
  middlewares: [authenticate("customer", ["bearer"])],
}, {
  matcher: "/store/snowforce/checkout/:id/shipping-options", methods: ["GET"],
  middlewares: [authenticate("customer", ["bearer"]), requireOwnedCart],
}, {
  matcher: "/store/snowforce/checkout/:id/pickup", methods: ["POST"],
  middlewares: [authenticate("customer", ["bearer"])],
}, {
  matcher: "/store/snowforce/orders/:id", methods: ["GET"],
  middlewares: [authenticate("customer", ["bearer"])],
}, {
  matcher: "/store/snowforce/orders/:id/after-sales*", methods: ["GET", "POST"],
  middlewares: [authenticate("customer", ["bearer"])],
}, {
  matcher: "/store/returns*", methods: ["POST", "DELETE"],
  middlewares: [useAfterSalesBoundary],
}, {
  matcher: "/store/shipping-options", methods: ["GET"],
  middlewares: [authenticate("customer", ["bearer"]), requireOwnedCart],
}, {
  matcher: "/store/carts/:id/line-items/:line_id", methods: ["DELETE"],
  middlewares: [useCheckoutBoundary],
}, {
  matcher: "/store/payment-collections*", methods: ["POST", "DELETE"],
  middlewares: [useCheckoutBoundary],
}] });
