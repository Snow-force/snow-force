import { authenticate, defineMiddlewares } from "@medusajs/framework/http";
import { requireOwnedCart, useCheckoutBoundary } from "./cart-ownership";
import { useAfterSalesBoundary } from "./after-sales-boundary";

export default defineMiddlewares({ routes: [{
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
  matcher: "/store/snowforce/checkout/:id/quote", methods: ["POST"],
  middlewares: [authenticate("customer", ["bearer"])],
}, {
  matcher: "/store/snowforce/checkout/:id/shipping-options", methods: ["GET"],
  middlewares: [authenticate("customer", ["bearer"]), requireOwnedCart],
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
