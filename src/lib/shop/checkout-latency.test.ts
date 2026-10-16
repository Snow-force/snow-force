import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ context: vi.fn(), request: vi.fn(), region: vi.fn(), syncOrder: vi.fn() }));
vi.mock("./cart-context", () => ({ getCartContext: mocks.context }));
vi.mock("./storefront-repository", () => ({ getUsCommerceRegion: mocks.region }));
vi.mock("./order-sync", () => ({ syncOwnedMemberOrder: mocks.syncOrder }));
import { changeShopCheckoutAction } from "./checkout-actions";
import { CommerceRejectedError } from "./commerce-client";
import { fixtureCart } from "./shop.fixtures";
import { nativeCheckoutAddress, type CheckoutAddress } from "./checkout";
import { shopPublishedPolicySchema } from "./policies";

const address: CheckoutAddress = { name: "Fixture Rider", phone: "5551234567", address1: "Test street", address2: "", city: "Test city", state: "CA", postalCode: "90001", countryCode: "US" };
const policy = shopPublishedPolicySchema.parse({ schema_version: 1, version: 1, effective_at: "2026-01-01T00:00:00.000Z", content: {
  seller_name: "Fixture seller", customer_service_email: "support@example.test",
  terms: { return_window_days: 30, approved_dispatch_days: 14, review_business_days: 2, refund_business_days: 5, processing_business_days_min: 1, processing_business_days_max: 2, transit_business_days_min: 3, transit_business_days_max: 7 },
  copy: Object.fromEntries(["shipping", "requests", "conditions", "shipping_costs", "refunds", "return_address", "consumer_rights"].map(key => [key, { en: "Published terms", zh: "Published fixture terms" }]))
} });
const quote = { totalCents: 8990, grossCents: 7995, discountCents: 0, merchandiseCents: 7995, shippingCents: 995, salesTaxCents: 0, fees: [], expiresAt: 2000000000 };
const cart = { ...fixtureCart, total: 89.9, shipping_total: 9.95, shipping_address: nativeCheckoutAddress(address), shipping_methods: [{ shipping_option_id: "so_fixture", name: "US standard", amount: 9.95 }] };
const review = { status: "review", cart, fingerprint: "a".repeat(64), paymentStarted: false, configured: true, policy, policyAccepted: false, taxQuote: { ...quote, ready: true } };
const option = { id: "so_fixture", name: "US standard", calculated_price: { currency_code: "usd", calculated_amount: 9.95 } };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
const writes = () => mocks.request.mock.calls.filter(call => call[2]?.method === "POST").map(call => String(call[0]).split("?")[0]);

describe("checkout latency optimizations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_COMMERCE_STRIPE_PUBLISHABLE_KEY", "pk_test_fixture");
    vi.stubEnv("SHOP_CHECKOUT_OPTIMIZED_READS", "true");
    mocks.region.mockResolvedValue("reg_us");
    mocks.context.mockResolvedValue({ customer: { customerId: "cus_fixture", email: "verified@example.test", token: "trusted-token", request: mocks.request }, cartId: "cart_fixture" });
    mocks.request.mockImplementation(async (path, schema) => {
      if (path.endsWith("/edit")) return schema.parse({ status: "editable", quote_removed: true, review_required: true });
      if (path.endsWith("/quote")) return schema.parse({ status: "quoted", reused: false, taxQuote: quote });
      if (path.endsWith("/shipping-options")) return schema.parse({ shipping_options: [option] });
      if (path === "/store/snowforce/checkout/cart_fixture") return schema.parse(review);
      return schema.parse({ cart });
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("retains fresh eligible delivery after an address save, but always revalidates the tax quote", async () => {
    expect(await changeShopCheckoutAction({ kind: "delivery", address })).toMatchObject({ status: "review", selectedOptionId: "so_fixture", taxQuote: { ready: true } });
    expect(writes()).toEqual(["/store/snowforce/checkout/cart_fixture/edit", "/store/carts/cart_fixture", "/store/snowforce/checkout/cart_fixture/quote"]);
    expect(mocks.request.mock.calls.filter(([path]) => path.endsWith("/shipping-options"))).toHaveLength(2);
    expect(mocks.request.mock.calls.some(([, , options]) => options?.body?.kind === "prepare")).toBe(false);
  });
  it.each([
    { reason: "missing", shipping_methods: [] },
    { reason: "different", shipping_methods: [{ shipping_option_id: "so_old", name: "Old method", amount: 9.95 }] },
    { reason: "repriced", shipping_methods: [{ shipping_option_id: "so_fixture", name: "US standard", amount: 5 }] },
    { reason: "ambiguous", shipping_methods: [cart.shipping_methods[0], cart.shipping_methods[0]] },
  ])("applies delivery when the returned method is $reason", async ({ shipping_methods }) => {
    const original = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(async (path, schema, options) => path.startsWith("/store/carts/") && options?.method === "POST" && !path.includes("/shipping-methods")
      ? schema.parse({ cart: { ...cart, shipping_methods } }) : original(path, schema, options));
    expect(await changeShopCheckoutAction({ kind: "delivery", address })).toMatchObject({ status: "review" });
    expect(writes()).toEqual(["/store/snowforce/checkout/cart_fixture/edit", "/store/carts/cart_fixture", "/store/snowforce/checkout/cart_fixture/edit", "/store/carts/cart_fixture/shipping-methods", "/store/snowforce/checkout/cart_fixture/quote"]);
  });
  it("does not reuse an old method when the address write returns a foreign cart or customer", async () => {
    const original = mocks.request.getMockImplementation()!;
    for (const changed of [{ id: "cart_foreign" }, { customer: { id: "cus_foreign" } }]) {
      mocks.request.mockClear();
      mocks.request.mockImplementation(async (path, schema, options) => path.startsWith("/store/carts/") && options?.method === "POST"
        ? schema.parse({ cart: { ...cart, ...changed } }) : original(path, schema, options));
      expect(await changeShopCheckoutAction({ kind: "delivery", address })).toEqual({ status: "signed-out" });
      expect(mocks.request.mock.calls.some(([path]) => path.endsWith("/quote") || path.endsWith("/shipping-options"))).toBe(false);
    }
  });
  it("keeps a rejected native quote rejected even when delivery could be reused", async () => {
    const original = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(async (path, schema, options) => {
      if (path.endsWith("/quote")) throw new CommerceRejectedError();
      return original(path, schema, options);
    });
    expect(await changeShopCheckoutAction({ kind: "delivery", address })).toEqual({ status: "rejected" });
    expect(mocks.request.mock.calls.some(([path]) => path === "/store/snowforce/checkout/cart_fixture")).toBe(false);
  });
  it("never auto-selects or quotes when several alternatives are eligible", async () => {
    const original = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(async (path, schema, options) => path.endsWith("/shipping-options")
      ? schema.parse({ shipping_options: [option, { ...option, id: "so_other" }] }) : original(path, schema, options));
    expect(await changeShopCheckoutAction({ kind: "delivery", address })).toMatchObject({ status: "review", options: [{ id: "so_fixture" }, { id: "so_other" }] });
    expect(writes()).toEqual(["/store/snowforce/checkout/cart_fixture/edit", "/store/carts/cart_fixture"]);
  });
  it("overlaps final status and alternatives instead of awaiting the status first", async () => {
    const gate = deferred();
    const original = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(async (path, schema, options) => {
      if (path === "/store/snowforce/checkout/cart_fixture") await gate.promise;
      return original(path, schema, options);
    });
    const operation = changeShopCheckoutAction({ kind: "delivery", address });
    try {
      await vi.waitFor(() => expect(mocks.request.mock.calls.filter(([path]) => path.endsWith("/shipping-options"))).toHaveLength(2));
    } finally { gate.resolve(); }
    expect(await operation).toMatchObject({ status: "review" });
  });
  it("does not let an optional alternatives failure hide an already completed order", async () => {
    const original = mocks.request.getMockImplementation()!;
    let alternatives = 0;
    mocks.request.mockImplementation(async (path, schema, options) => {
      if (path.endsWith("/shipping-options") && ++alternatives === 2) throw new Error("Optional read failed");
      if (path === "/store/snowforce/checkout/cart_fixture") return schema.parse({ status: "complete", order: { id: "order_fixture", number: "1001", total: 89.9 } });
      return original(path, schema, options);
    });
    expect(await changeShopCheckoutAction({ kind: "delivery", address })).toMatchObject({ status: "complete" });
    expect(mocks.syncOrder).toHaveBeenCalledWith(expect.objectContaining({ customerId: "cus_fixture" }), "order_fixture");
  });
  it("fails closed when alternatives are required and their fresh read fails", async () => {
    const original = mocks.request.getMockImplementation()!;
    let alternatives = 0;
    mocks.request.mockImplementation(async (path, schema, options) => {
      if (path.endsWith("/shipping-options") && ++alternatives === 2) throw new Error("Private connection details");
      return original(path, schema, options);
    });
    expect(await changeShopCheckoutAction({ kind: "delivery", address })).toEqual({ status: "unavailable" });
  });
  it("has a reversible flag and preserves the conservative workflow when disabled", async () => {
    vi.stubEnv("SHOP_CHECKOUT_OPTIMIZED_READS", "false");
    expect(await changeShopCheckoutAction({ kind: "delivery", address })).toMatchObject({ status: "review" });
    expect(writes()).toHaveLength(5);
    expect(writes()).toContain("/store/carts/cart_fixture/shipping-methods");
  });
  it("revalidates an unchanged explicit shipping selection without rerunning its mutation", async () => {
    expect(await changeShopCheckoutAction({ kind: "shipping-review", optionId: "so_fixture" })).toMatchObject({ status: "review" });
    expect(writes()).toEqual(["/store/snowforce/checkout/cart_fixture/quote"]);
  });
});
