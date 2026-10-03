import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ context: vi.fn(), request: vi.fn(), region: vi.fn(), syncOrder: vi.fn() }));
vi.mock("./cart-context", () => ({ getCartContext: mocks.context }));
vi.mock("./storefront-repository", () => ({ getUsCommerceRegion: mocks.region }));
vi.mock("./order-sync", () => ({ syncOwnedMemberOrder: mocks.syncOrder }));
import { getShopCheckoutAction, changeShopCheckoutAction } from "./checkout-actions";
import { CommerceAuthorizationError, CommerceRejectedError } from "./commerce-client";
import { fixtureCart } from "./shop.fixtures";
import { nativeCheckoutAddress, type CheckoutAddress, type CheckoutTaxQuote } from "./checkout";
import { shopPublishedPolicySchema } from "./policies";
const policy = shopPublishedPolicySchema.parse({ schema_version: 1, version: 1, effective_at: "2026-01-01T00:00:00.000Z", content: {
  seller_name: "Fixture seller", customer_service_email: "support@example.test",
  terms: { return_window_days: 30, approved_dispatch_days: 14, review_business_days: 2, refund_business_days: 5, processing_business_days_min: 1, processing_business_days_max: 2, transit_business_days_min: 3, transit_business_days_max: 7 },
  copy: Object.fromEntries(["shipping", "requests", "conditions", "shipping_costs", "refunds", "return_address", "consumer_rights"].map((key) => [key, { en: "Published terms", zh: "已发布条款" }]))
} });
const address: CheckoutAddress = { name: "Fixture Rider", phone: "5551234567", address1: "Test street", address2: "", city: "Test city", state: "CA", postalCode: "90001", countryCode: "US" };
const taxQuote: CheckoutTaxQuote = { totalCents: 8990, grossCents: 7995, discountCents: 0, merchandiseCents: 7995, shippingCents: 995, salesTaxCents: 0, fees: [], expiresAt: 2000000000, ready: true };
const fingerprint = "a".repeat(64);
const nativeCart = { ...fixtureCart, total: 89.9, shipping_total: 9.95, shipping_address: nativeCheckoutAddress(address), shipping_methods: [{ shipping_option_id: "so_fixture", name: "US standard", amount: 9.95 }] };
let review: { status: "review"; cart: typeof nativeCart; fingerprint: string; paymentStarted: boolean; configured: boolean; policy: typeof policy | null; policyAccepted: boolean; taxQuote: CheckoutTaxQuote | null };
describe("owned checkout commands", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.stubEnv("NEXT_PUBLIC_COMMERCE_STRIPE_PUBLISHABLE_KEY", "pk_test_fixture");
    review = { status: "review", cart: nativeCart, fingerprint, paymentStarted: false, configured: true, policy, policyAccepted: false, taxQuote };
    mocks.region.mockResolvedValue("reg_us");
    mocks.context.mockResolvedValue({ customer: { customerId: "cus_fixture", email: "verified@example.com", token: "trusted-token", request: mocks.request }, cartId: "cart_fixture" });
    mocks.request.mockImplementation(async (path, schema, options) => {
      if (path.endsWith("/edit")) return schema.parse({ status: "editable", quote_removed: true, review_required: true });
      if (path.endsWith("/quote")) { review.taxQuote = taxQuote; const { ready: _ready, ...amounts } = taxQuote; return schema.parse({ status: "quoted", reused: false, taxQuote: amounts }); }
      if (path.endsWith("/shipping-options")) return schema.parse({ shipping_options: [{ id: "so_fixture", name: "US standard", calculated_price: { currency_code: "usd", calculated_amount: 9.95 } }] });
      if (path.startsWith("/store/snowforce/checkout/")) return schema.parse(options?.method === "POST" ? options.body.kind === "recover" ? { status: "recovered", unlocked: false } : options.body.kind === "complete" ? { status: "complete", order: { id: "order_fixture", number: "1001", total: 89.9 } } : { status: "payment", clientSecret: "pi_fixture_secret_fixture", totalCents: 8990, currency: "usd" } : review);
      return schema.parse({ cart: nativeCart });
    });
  });
  it("rejects client amounts, email, cart identity and invalid addresses before authentication", async () => {
    for (const value of [{ kind: "payment", policyVersion: 1, agreed: true, fingerprint, total: 0.01 }, { kind: "complete", cartId: "cart_other" }, { kind: "address", address: { ...address, email: "attacker@example.com" } }, { kind: "address", address: { ...address, countryCode: "CN" } }]) expect(await changeShopCheckoutAction(value)).toEqual({ status: "invalid" });
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it("handles empty or unverified accounts without creating payment", async () => {
    mocks.context.mockResolvedValue({ customer: {}, cartId: null });
    expect(await getShopCheckoutAction()).toEqual({ status: "empty" });
    mocks.context.mockRejectedValue(new CommerceAuthorizationError());
    expect(await changeShopCheckoutAction({ kind: "complete" })).toEqual({ status: "signed-out" });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("displays totals and fingerprint from the same native quote and strips internal identifiers", async () => {
    const result = await getShopCheckoutAction();
    expect(result).toMatchObject({ status: "review", cart: { total: 89.9, shippingTotal: 9.95 }, fingerprint, address, options: [{ price: 9.95 }] });
    expect(JSON.stringify(result)).not.toMatch(/trusted-token|cus_fixture|cart_fixture|client_secret/);
    expect(mocks.request.mock.calls[0][0]).toBe("/store/snowforce/checkout/cart_fixture");
  });
  it("clears the old quote before saving the verified account email and normalized US address", async () => {
    expect((await changeShopCheckoutAction({ kind: "address", address })).status).toBe("review");
    const mutations = mocks.request.mock.calls.filter((call) => call[2]?.method === "POST");
    expect(mutations[0][0]).toBe("/store/snowforce/checkout/cart_fixture/edit");
    expect(mutations[0][2].body).toEqual({});
    expect(mutations[1][2].body).toEqual({ email: "verified@example.com", shipping_address: nativeCheckoutAddress(address), billing_address: nativeCheckoutAddress(address) });
    expect(mutations).toHaveLength(2);
  });
  it("accepts only backend eligible shipping IDs without trusting a client fee", async () => {
    expect(await changeShopCheckoutAction({ kind: "shipping", optionId: "so_foreign" })).toEqual({ status: "rejected" });
    expect(mocks.request.mock.calls.filter((call) => call[2]?.method === "POST")).toHaveLength(0);
    expect((await changeShopCheckoutAction({ kind: "shipping", optionId: "so_fixture" })).status).toBe("review");
    expect(mocks.request.mock.calls.find((call) => call[0].includes("shipping-methods"))?.[2].body).toEqual({ option_id: "so_fixture" });
  });
  it("allows address and delivery before a quote and requires an explicit server quote before payment", async () => {
    review.taxQuote = null;
    expect((await getShopCheckoutAction()).status).toBe("review");
    expect((await changeShopCheckoutAction({ kind: "address", address })).status).toBe("review");
    expect((await changeShopCheckoutAction({ kind: "shipping", optionId: "so_fixture" })).status).toBe("review");
    expect(await changeShopCheckoutAction({ kind: "payment", fingerprint, policyVersion: 1, agreed: true })).toEqual({ status: "rejected" });
    expect((await changeShopCheckoutAction({ kind: "quote" })).status).toBe("review");
    expect(mocks.request.mock.calls.find(call => call[0].endsWith("/quote"))?.[2]).toEqual({ token: "trusted-token", method: "POST", body: {} });
    expect((await changeShopCheckoutAction({ kind: "payment", fingerprint, policyVersion: 1, agreed: true })).status).toBe("payment");
  });
  it("rejects quoting without delivery, after payment, or with browser amounts and refuses an expired or changed quote", async () => {
    for (const value of [{ kind: "quote", total: 1 }, { kind: "quote", cartId: "cart_other" }]) expect(await changeShopCheckoutAction(value)).toEqual({ status: "invalid" });
    review.paymentStarted = true;
    expect(await changeShopCheckoutAction({ kind: "quote" })).toEqual({ status: "rejected" });
    review.paymentStarted = false;
    for (const quote of [{ ...taxQuote, ready: false }, { ...taxQuote, totalCents: 8991, salesTaxCents: 1 }]) {
      review.taxQuote = quote;
      expect(await changeShopCheckoutAction({ kind: "payment", fingerprint, policyVersion: 1, agreed: true })).toEqual({ status: "rejected" });
    }
    review.cart = { ...nativeCart, shipping_methods: [] };
    expect(await changeShopCheckoutAction({ kind: "quote" })).toEqual({ status: "rejected" });
    expect(mocks.request.mock.calls.some(call => call[2]?.method === "POST")).toBe(false);
  });
  it("blocks stale review fingerprints and unconfigured taxes or publishable keys before initiating payment", async () => {
    expect(await changeShopCheckoutAction({ kind: "payment", policyVersion: 1, agreed: true, fingerprint: "b".repeat(64) })).toEqual({ status: "rejected" });
    review.configured = false;
    expect(await changeShopCheckoutAction({ kind: "payment", policyVersion: 1, agreed: true, fingerprint })).toEqual({ status: "not-configured" });
    review.configured = true; vi.stubEnv("NEXT_PUBLIC_COMMERCE_STRIPE_PUBLISHABLE_KEY", "sk_test_secret");
    expect(await changeShopCheckoutAction({ kind: "payment", policyVersion: 1, agreed: true, fingerprint })).toEqual({ status: "not-configured" });
    expect(mocks.request.mock.calls.filter((call) => call[2]?.method === "POST")).toHaveLength(0);
  });
  it("reuses the native payment boundary and forbids edits after payment begins", async () => {
    review.paymentStarted = true;
    expect(await changeShopCheckoutAction({ kind: "address", address })).toEqual({ status: "rejected" });
    expect(await changeShopCheckoutAction({ kind: "payment", policyVersion: 1, agreed: true, fingerprint })).toEqual({ status: "payment", publishableKey: "pk_test_fixture", clientSecret: "pi_fixture_secret_fixture", total: 89.9 });
    expect(mocks.request.mock.calls.find((call) => call[2]?.method === "POST")?.[2].body).toEqual({ kind: "prepare", fingerprint, policyVersion: 1, agreed: true });
  });
  it("displays the backend's exact USD cents for fractional native tax totals", async () => {
    review.cart = { ...nativeCart, total: 89.90000348 };
    expect(await changeShopCheckoutAction({ kind: "payment", policyVersion: 1, agreed: true, fingerprint })).toEqual({ status: "payment", publishableKey: "pk_test_fixture", clientSecret: "pi_fixture_secret_fixture", total: 89.9 });
  });
  it("rejects changed payable cents and malformed or foreign payment amounts", async () => {
    const request = mocks.request.getMockImplementation()!;
    for (const delta of [{ totalCents: 8991 }, { totalCents: 8990.001 }, { totalCents: 0 }, { currency: "eur" }, { totalCents: undefined }, { currency: undefined }]) {
      mocks.request.mockImplementation(async (path, schema, options) => path.startsWith("/store/snowforce/checkout/") && options?.method === "POST"
        ? schema.parse({ status: "payment", clientSecret: "pi_fixture_secret_fixture", totalCents: 8990, currency: "usd", ...delta })
        : request(path, schema, options));
      expect(await changeShopCheckoutAction({ kind: "payment", policyVersion: 1, agreed: true, fingerprint })).toEqual({ status: delta.totalCents === 8991 ? "rejected" : "unavailable" });
    }
  });
  it("requires explicit agreement to the reviewed policy version and rejects missing policies", async () => {
    expect(await changeShopCheckoutAction({ kind: "payment", fingerprint })).toEqual({ status: "invalid" });
    expect(await changeShopCheckoutAction({ kind: "payment", fingerprint, policyVersion: 1, agreed: false })).toEqual({ status: "invalid" });
    expect(mocks.context).not.toHaveBeenCalled();
    expect(await changeShopCheckoutAction({ kind: "payment", fingerprint, policyVersion: 2, agreed: true })).toEqual({ status: "rejected" });
    review.policy = null;
    expect(await changeShopCheckoutAction({ kind: "payment", fingerprint, policyVersion: 1, agreed: true })).toEqual({ status: "rejected" });
    expect(mocks.request.mock.calls.some((call) => call[2]?.method === "POST")).toBe(false);
  });
  it("requires actual backend ownership and order completion rather than a browser success flag", async () => {
    review.cart = { ...nativeCart, customer: { id: "cus_other" } };
    expect(await getShopCheckoutAction()).toEqual({ status: "signed-out" });
    review.cart = nativeCart;
    expect(await changeShopCheckoutAction({ kind: "complete" })).toEqual({ status: "complete", order: { id: "order_fixture", number: "1001", total: 89.9 } });
    expect(mocks.syncOrder).toHaveBeenCalledWith(expect.objectContaining({ customerId: "cus_fixture" }), "order_fixture");
  });
  it("returns a retry state when the native order exists but projection failed, and repairs on retry", async () => {
    mocks.syncOrder.mockRejectedValueOnce(new Error("database unavailable"));
    expect(await changeShopCheckoutAction({ kind: "complete" })).toEqual({ status: "unavailable" });
    expect((await changeShopCheckoutAction({ kind: "complete" })).status).toBe("complete");
    expect(mocks.syncOrder).toHaveBeenCalledTimes(2);
  });
  it("repairs a completed order on checkout return without starting another payment", async () => {
    mocks.request.mockImplementation(async (_path, schema) => schema.parse({ status: "complete", order: { id: "order_fixture", number: "1001", total: 89.9 } }));
    expect((await getShopCheckoutAction()).status).toBe("complete");
    expect(mocks.syncOrder).toHaveBeenCalledTimes(1);
    expect(mocks.request.mock.calls.some((call) => call[2]?.method === "POST")).toBe(false);
  });
  it("rejects a removed region and handles an empty cart without offering payment", async () => {
    mocks.region.mockResolvedValue(null);
    expect(await getShopCheckoutAction()).toEqual({ status: "not-configured" });
    review.cart = { ...nativeCart, items: [] };
    expect(await getShopCheckoutAction()).toEqual({ status: "empty" });
  });
  it("keeps pending completion pending and rejects an unrecognized success response", async () => {
    mocks.request.mockImplementation(async (path, schema) => schema.parse(path.includes("/snowforce/checkout/") ? { status: "processing" } : { cart: nativeCart }));
    expect(await changeShopCheckoutAction({ kind: "complete" })).toEqual({ status: "processing" });
    mocks.request.mockImplementation(async (_path, schema) => schema.parse({ status: "succeeded" }));
    expect(await getShopCheckoutAction()).toEqual({ status: "unavailable" });
  });
  it("returns safe retry states for backend rejection and connection failure", async () => {
    mocks.request.mockRejectedValue(new CommerceRejectedError());
    expect(await getShopCheckoutAction()).toEqual({ status: "rejected" });
    mocks.request.mockRejectedValue(new Error("secret connection string"));
    expect(await getShopCheckoutAction()).toEqual({ status: "unavailable" });
  });
  it("checks payment ownership before recovery and bypasses policy, tax and payment configuration gates", async () => {
    review = { ...review, policy: null, configured: false, paymentStarted: true, policyAccepted: false };
    vi.stubEnv("NEXT_PUBLIC_COMMERCE_STRIPE_PUBLISHABLE_KEY", "");
    expect(await changeShopCheckoutAction({ kind: "recover" })).toMatchObject({ status: "review", configured: false, policy: null, paymentCheck: "active" });
    expect(mocks.request.mock.calls.slice(0, 3).map(([path, , options]) => [path, options?.method ?? "GET"])).toEqual([
      [expect.stringContaining("/store/carts/cart_fixture?"), "GET"],
      ["/store/snowforce/checkout/cart_fixture", "POST"],
      ["/store/snowforce/checkout/cart_fixture", "GET"],
    ]);
    expect(mocks.request.mock.calls[1][2].body).toEqual({ kind: "recover" });
    expect(mocks.syncOrder).not.toHaveBeenCalled();
  });
  it("refreshes the canceled payment review and asks for current policy agreement", async () => {
    const request = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(async (path, schema, options) => {
      if (options?.body?.kind === "recover") {
        review = { ...review, paymentStarted: false, policyAccepted: false, policy: { ...policy, version: 2 } };
        return schema.parse({ status: "recovered", unlocked: true });
      }
      return request(path, schema, options);
    });
    expect(await changeShopCheckoutAction({ kind: "recover" })).toMatchObject({ status: "review", paymentCheck: "unlocked", paymentStarted: false, policyAccepted: false, policy: { version: 2 } });
    expect(mocks.request.mock.calls.filter((call) => call[2]?.method === "POST")).toHaveLength(1);
  });
  it("never checks payment for signed-out or foreign-cart customers", async () => {
    mocks.context.mockRejectedValueOnce(new CommerceAuthorizationError());
    expect(await changeShopCheckoutAction({ kind: "recover" })).toEqual({ status: "signed-out" });
    expect(mocks.request).not.toHaveBeenCalled();
    mocks.request.mockImplementation(async (_path, schema) => schema.parse({ cart: { ...nativeCart, customer: { id: "cus_foreign" } } }));
    expect(await changeShopCheckoutAction({ kind: "recover" })).toEqual({ status: "signed-out" });
    expect(mocks.request.mock.calls.filter((call) => call[2]?.method === "POST")).toHaveLength(0);
  });
  it("retains a new active payment started in another browser after cancellation recovery", async () => {
    const request = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(async (path, schema, options) => {
      if (options?.body?.kind === "recover") {
        review = { ...review, paymentStarted: true, policyAccepted: true };
        return schema.parse({ status: "recovered", unlocked: true });
      }
      return request(path, schema, options);
    });
    expect(await changeShopCheckoutAction({ kind: "recover" })).toMatchObject({ status: "review", paymentCheck: "active", paymentStarted: true, policyAccepted: true });
    expect(mocks.request.mock.calls.filter((call) => call[2]?.method === "POST")).toHaveLength(1);
  });
  it("synchronizes an already completed order from recovery without creating another payment", async () => {
    const request = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(async (path, schema, options) => options?.body?.kind === "recover" ? schema.parse({ status: "complete", order: { id: "order_fixture", number: "1001", total: 89.9 } }) : request(path, schema, options));
    expect(await changeShopCheckoutAction({ kind: "recover" })).toEqual({ status: "complete", order: { id: "order_fixture", number: "1001", total: 89.9 } });
    expect(mocks.syncOrder).toHaveBeenCalledWith(expect.objectContaining({ customerId: "cus_fixture" }), "order_fixture");
    expect(mocks.request.mock.calls).toHaveLength(2);
    expect(mocks.region).not.toHaveBeenCalled();
  });
  it.each([new CommerceRejectedError(), new Error("private transport details")])("returns safe recovery failures without exposing connection or payment data", async (error) => {
    const request = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(async (path, schema, options) => { if (options?.body?.kind === "recover") throw error; return request(path, schema, options); });
    expect(await changeShopCheckoutAction({ kind: "recover" })).toEqual({ status: error instanceof CommerceRejectedError ? "rejected" : "unavailable" });
    expect(mocks.request.mock.calls.filter((call) => call[2]?.method === "POST")).toHaveLength(1);
    expect(mocks.syncOrder).not.toHaveBeenCalled();
  });
});
