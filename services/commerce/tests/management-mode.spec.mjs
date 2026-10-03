import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
require("ts-node/register/transpile-only");
const { isManagementMode, assertSalesOperations } = require("../src/lib/operating-mode.ts");
const { useManagementBoundary } = require("../src/api/management-boundary.ts");
const { validateCheckoutCart } = require("../src/workflows/hooks/validate-checkout.ts");
const { routes } = require("../src/api/middlewares.ts").default;
const express = require("express");

async function management(callback) {
  const saved = process.env.COMMERCE_OPERATING_MODE;
  process.env.COMMERCE_OPERATING_MODE = "management";
  try { await callback(); }
  finally { if (saved === undefined) delete process.env.COMMERCE_OPERATING_MODE; else process.env.COMMERCE_OPERATING_MODE = saved; }
}

test("production fails closed unless an explicit sales mode is selected", () => {
  for (const mode of [undefined, "management", "typo"]) assert.equal(isManagementMode({ NODE_ENV: "production", COMMERCE_OPERATING_MODE: mode }), true);
  assert.equal(isManagementMode({ NODE_ENV: "production", COMMERCE_OPERATING_MODE: "sales" }), false);
  assert.equal(isManagementMode({ NODE_ENV: "development" }), false);
});

test("product, price, stock and file writes remain available to the normal admin authentication layer", async () => management(() => {
  for (const path of ["/admin/products", "/admin/products/prod_fixture/variants/variant_fixture", "/admin/price-lists", "/admin/inventory-items/item_fixture/location-levels", "/admin/stock-locations", "/admin/uploads", "/admin/snowforce/policies", "/admin/snowforce/shipping"]) {
    let continued = false;
    useManagementBoundary({ method: "POST", path }, {}, () => { continued = true; });
    assert.equal(continued, true, path);
  }
}));

test("management blocks customer mutations, checkout reads and all payment webhook entry points", async () => management(() => {
  for (const [method, path] of [["POST", "/store/carts"], ["POST", "/store/carts/cart_fixture/complete"], ["POST", "/store/payment-collections/paycol_fixture/payment-sessions"], ["DELETE", "/store/carts/cart_fixture"], ["GET", "/store/snowforce/checkout/cart_fixture"], ["POST", "/hooks/payment/stripe_stripe"]]) {
    assert.throws(() => useManagementBoundary({ method, path }, {}, () => assert.fail("must not continue")), /administration only/);
  }
  for (const path of ["/store/products", "/store/snowforce/policies", "/admin/orders", "/admin/snowforce/payments"]) {
    let continued = false;
    useManagementBoundary({ method: "GET", path }, {}, () => { continued = true; });
    assert.equal(continued, true);
  }
  let preflight = false;
  useManagementBoundary({ method: "OPTIONS", path: "/store/carts" }, {}, () => { preflight = true; });
  assert.equal(preflight, true);
}));

test("native and custom order, capture, refund and after-sales writes stay closed", async () => management(() => {
  for (const path of ["/admin/orders/order_fixture/fulfillments", "/admin/draft-orders", "/admin/payments/pay_fixture/capture", "/admin/payments/pay_fixture/refund", "/admin/payment-collections", "/admin/returns", "/admin/exchanges", "/admin/claims", "/admin/workflows-executions/exec_fixture/retry", "/admin/snowforce/payments/pay_fixture", "/admin/snowforce/after-sales/request_fixture/funds", "/admin/snowforce/tax/sales/order_fixture"]) {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.throws(() => useManagementBoundary({ method, path }, {}, () => assert.fail("must not mutate")), /administration only/);
  }
}));

test("direct order completion workflows stop before database or provider access even if the tax flag is true", async () => management(async () => {
  const saved = process.env.COMMERCE_TAX_POLICY_CONFIRMED;
  process.env.COMMERCE_TAX_POLICY_CONFIRMED = "true";
  try {
    assert.throws(() => assertSalesOperations(), /administration only/);
    await assert.rejects(() => validateCheckoutCart({ id: "cart_fixture" }, {}, { resolve: () => assert.fail("must not access database or provider") }), /administration only/);
  } finally { if (saved === undefined) delete process.env.COMMERCE_TAX_POLICY_CONFIRMED; else process.env.COMMERCE_TAX_POLICY_CONFIRMED = saved; }
}));

test("sales mode passes through to existing checkout and authentication checks", () => {
  const saved = process.env.COMMERCE_OPERATING_MODE;
  process.env.COMMERCE_OPERATING_MODE = "sales";
  try {
    let continued = false;
    useManagementBoundary({ method: "POST", path: "/store/carts" }, {}, () => { continued = true; });
    assert.equal(continued, true);
    assert.doesNotThrow(() => assertSalesOperations());
  } finally { if (saved === undefined) delete process.env.COMMERCE_OPERATING_MODE; else process.env.COMMERCE_OPERATING_MODE = saved; }
});

test("the actual configured middleware rejects routed HTTP requests before handlers run", async () => management(async () => {
  const app = express();
  for (const route of routes.filter(route => route.middlewares.includes(useManagementBoundary))) {
    for (const method of route.methods) app[method.toLowerCase()](route.matcher, useManagementBoundary);
  }
  app.all("*", (_req, res) => res.json({ handlerReached: true }));
  app.use((error, _req, res, _next) => res.status(403).json({ blocked: error.message.includes("administration only") }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const [method, path] of [["POST", "/store/carts"], ["POST", "/admin/payments/pay_fixture/capture"], ["POST", "/hooks/payment/stripe_stripe"], ["GET", "/store/snowforce/checkout/cart_fixture?review=1"]]) {
      const response = await fetch(origin + path, { method });
      assert.equal(response.status, 403, path);
      assert.deepEqual(await response.json(), { blocked: true });
    }
    for (const [method, path] of [["GET", "/store/products"], ["POST", "/admin/products"], ["POST", "/admin/inventory-items/item_fixture/location-levels"]]) {
      const response = await fetch(origin + path, { method });
      assert.equal(response.status, 200, path);
      assert.deepEqual(await response.json(), { handlerReached: true });
    }
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}));
