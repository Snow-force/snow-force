import { describe, expect, it } from "vitest";
import { checkoutAddressDraftKey, checkoutPreviewAddressKey, checkoutDraftInputSchema, checkoutInputSchema, checkoutRecoverySchema, checkoutStatusSchema, checkoutQuoteResponseSchema, checkoutTaxQuoteSchema, type CheckoutAddress } from "./checkout";
import type { ShopPublishedPolicy } from "./policies";

const fingerprint = "a".repeat(64);
const payment = { kind: "payment", fingerprint, policyVersion: 3, agreed: true };
const policy: ShopPublishedPolicy = {
  schema_version: 1, version: 3, effective_at: "2026-10-01T12:00:00.000Z",
  content: {
    seller_name: "Fixture Gear LLC", customer_service_email: "support@example.test",
    terms: { return_window_days: 30, approved_dispatch_days: 14, review_business_days: 2, refund_business_days: 5, processing_business_days_min: 1, processing_business_days_max: 2, transit_business_days_min: 3, transit_business_days_max: 7 },
    copy: {
      shipping: { en: "Shipping terms", zh: "配送条款" }, requests: { en: "Request terms", zh: "申请条款" },
      conditions: { en: "Item conditions", zh: "商品条件" }, shipping_costs: { en: "Shipping costs", zh: "运费处理" },
      refunds: { en: "Refund terms", zh: "退款条款" }, return_address: { en: "Return address", zh: "退货地址" },
      consumer_rights: { en: "Consumer rights", zh: "消费者权利" },
    },
  },
};
const review = { status: "review", fingerprint, detailsVersion: null, paymentStarted: false, configured: true, policy, policyAccepted: false, taxQuote: null, pickupOffer: null, pickupSelected: false };

describe("checkout policy consent contract", () => {
  it("uses the server address projection for preview equivalence and only contact fields for pickup",()=>{
    const address:CheckoutAddress={name:"Test Rider",phone:"5551234567",address1:"Test street",address2:"",city:"Test city",state:"CA",postalCode:"90001",countryCode:"US"};
    expect(checkoutPreviewAddressKey({...address,name:" Test   Rider "})).toBe(checkoutPreviewAddressKey(address));
    expect(checkoutPreviewAddressKey({...address,address1:"",postalCode:""},true)).toBe(checkoutPreviewAddressKey(address,true));
    expect(checkoutPreviewAddressKey({...address,name:" "},true)).not.toBe(checkoutPreviewAddressKey(address,true));
    expect(checkoutPreviewAddressKey({...address,address1:" "})).not.toBe(checkoutPreviewAddressKey(address));
    expect(checkoutDraftInputSchema.safeParse({kind:"delivery",version:fingerprint,address,totalCents:1}).success).toBe(false);
  });
  it("compares drafts with the same trimming and state normalization as server address validation", () => {
    const saved: CheckoutAddress = { name: "Test Rider", phone: "5551234567", address1: "Test street", address2: "", city: "Test city", state: "CA", postalCode: "90001", countryCode: "US" };
    const padded = { ...saved, name: " Test Rider ", phone: " 5551234567 ", address1: " Test street ", address2: "  ", city: " Test city ", state: " ca ", postalCode: " 90001 " };
    expect(checkoutAddressDraftKey(padded)).toBe(checkoutAddressDraftKey(saved));
    expect(checkoutAddressDraftKey({ countryCode: "US", postalCode: "90001", state: "CA", city: "Test city", address2: "", address1: "Test street", phone: "5551234567", name: "Test Rider" })).toBe(checkoutAddressDraftKey(saved));
    for (const changes of [{ name: "New Rider" }, { address1: "Different street" }, { address2: "Unit 2" }, { city: "New city" }, { postalCode: "90001-1234" }, { name: "   " }, { phone: "invalid" }, { state: "ZZ" }, { postalCode: "invalid" }]) expect(checkoutAddressDraftKey({ ...saved, ...changes })).not.toBe(checkoutAddressDraftKey(saved));
  });
  it("enables receiving revisions only when the server supplies a valid digest", () => {
    const { detailsVersion: _version, ...legacy } = review;
    expect(checkoutStatusSchema.parse(legacy)).toHaveProperty("detailsVersion", null);
    expect(checkoutStatusSchema.parse({ ...review, detailsVersion: fingerprint })).toHaveProperty("detailsVersion", fingerprint);
    expect(checkoutStatusSchema.safeParse({ ...review, detailsVersion: "invalid" }).success).toBe(false);
    const contact = { name: "Test Rider", phone: "5551234567", appointmentConfirmed: true };
    expect(checkoutInputSchema.parse({ kind: "pickup-review", contact, version: fingerprint })).toHaveProperty("version", fingerprint);
    expect(checkoutInputSchema.safeParse({ kind: "pickup-review", contact, version: "invalid" }).success).toBe(false);
  });
  it("automatic review commands accept only address/contact or an option ID, never payable amounts or consent", () => {
    const contact = { name: "Test Rider", phone: "5551234567", appointmentConfirmed: true };
    expect(checkoutInputSchema.parse({ kind: "pickup-review", contact })).toEqual({ kind: "pickup-review", contact });
    expect(checkoutInputSchema.parse({ kind: "shipping-review", optionId: "so_fixture" })).toEqual({ kind: "shipping-review", optionId: "so_fixture" });
    for (const command of [{ kind: "pickup-review", contact: { ...contact, appointmentConfirmed: false } }, { kind: "shipping-review", optionId: "so_fixture", price: 0 }, { kind: "pickup-review", contact, agreed: true }, { kind: "delivery", address: { countryCode: "CA" } }]) expect(checkoutInputSchema.safeParse(command).success).toBe(false);
  });
  it("accepts only reconciled exact cents and a minimal authenticated quote command", () => {
    const taxQuote = { totalCents: 11263, grossCents: 11000, discountCents: 1001, merchandiseCents: 9999, shippingCents: 995, salesTaxCents: 241, fees: [{ state: "CO", amountCents: 28 }], expiresAt: 2000000000 };
    expect(checkoutInputSchema.parse({ kind: "quote" })).toEqual({ kind: "quote" });
    expect(checkoutQuoteResponseSchema.parse({ status: "quoted", reused: false, taxQuote })).toHaveProperty("taxQuote.totalCents", 11263);
    expect(checkoutTaxQuoteSchema.parse({ ...taxQuote, ready: false })).toHaveProperty("ready", false);
    for (const changes of [{ totalCents: 11262 }, { salesTaxCents: 241.001 }, { merchandiseCents: 10000 }, { fees: [{ state: "CA", amountCents: 28 }] }, { account_id: "acct_private" }, { expiresAt: 0 }]) expect(checkoutQuoteResponseSchema.safeParse({ status: "quoted", reused: false, taxQuote: { ...taxQuote, ...changes } }).success).toBe(false);
    for (const changes of [{ amount: 1 }, { cartId: "cart_other" }, { tax_code: "txcd_fixture" }]) expect(checkoutInputSchema.safeParse({ kind: "quote", ...changes }).success).toBe(false);
  });
  it("requires explicit agreement to a specific policy version with the reviewed quote", () => {
    expect(checkoutInputSchema.parse(payment)).toEqual(payment);
    expect(checkoutInputSchema.safeParse({ kind: "payment", fingerprint }).success).toBe(false);
    expect(checkoutInputSchema.safeParse({ kind: "payment", fingerprint, agreed: true }).success).toBe(false);
    expect(checkoutInputSchema.safeParse({ kind: "payment", fingerprint, policyVersion: 3 }).success).toBe(false);
  });
  it("rejects false, coercible and missing consent values", () => {
    for (const agreed of [false, "true", 1, {}, null, undefined]) expect(checkoutInputSchema.safeParse({ ...payment, agreed }).success).toBe(false);
  });
  it("rejects invalid versions, quote digests and injected policy content", () => {
    for (const policyVersion of [0, -1, 1.5, 1_000_001, "3", null, undefined]) expect(checkoutInputSchema.safeParse({ ...payment, policyVersion }).success).toBe(false);
    for (const invalid of ["", "a".repeat(63), "A".repeat(64), "not-the-reviewed-quote"]) expect(checkoutInputSchema.safeParse({ ...payment, fingerprint: invalid }).success).toBe(false);
    for (const added of [{ content: policy.content }, { policy }, { total: 0.01 }, { customerId: "cus_other" }]) expect(checkoutInputSchema.safeParse({ ...payment, ...added }).success).toBe(false);
  });
  it("carries a validated public policy and authoritative acceptance state in a review", () => {
    expect(checkoutStatusSchema.parse(review)).toEqual(review);
    expect(checkoutStatusSchema.parse({ ...review, paymentStarted: true, policyAccepted: true })).toMatchObject({ policyAccepted: true });
    expect(checkoutStatusSchema.parse({ ...review, policy: null })).toEqual({ ...review, policy: null });
  });
  it("rejects missing policies or acceptance flags and private publication fields", () => {
    for (const invalid of [
      { ...review, policy: undefined }, { ...review, policyAccepted: undefined }, { ...review, policyAccepted: "true" },
      { ...review, policy: { ...policy, published_by: "private_staff" } },
      { ...review, policy: { ...policy, version: 0 } },
      { ...review, policy: { ...policy, content: { ...policy.content, seller_name: "" } } },
    ]) expect(checkoutStatusSchema.safeParse(invalid).success).toBe(false);
  });
  it("keeps address, delivery and order-completion requests independent of policy acknowledgement", () => {
    expect(checkoutInputSchema.parse({ kind: "shipping", optionId: "so_fixture" })).toEqual({ kind: "shipping", optionId: "so_fixture" });
    expect(checkoutInputSchema.parse({ kind: "complete" })).toEqual({ kind: "complete" });
    expect(checkoutStatusSchema.parse({ status: "processing" })).toEqual({ status: "processing" });
  });
  it("allows a payment-state check without client payment identifiers or policy approval", () => {
    expect(checkoutInputSchema.parse({ kind: "recover" })).toEqual({ kind: "recover" });
    for (const extra of [{ paymentIntent: "pi_foreign" }, { unlocked: true }, { clientSecret: "pi_old_secret_fixture" }, { policyVersion: 3 }, { agreed: true }, { total: 0.01 }]) {
      expect(checkoutInputSchema.safeParse({ kind: "recover", ...extra }).success).toBe(false);
    }
  });
  it("accepts only authoritative canceled recovery or an already completed order", () => {
    for (const unlocked of [true, false]) expect(checkoutRecoverySchema.parse({ status: "recovered", unlocked })).toEqual({ status: "recovered", unlocked });
    expect(checkoutRecoverySchema.parse({ status: "complete", order: { id: "order_fixture", number: "1001", total: 89.9 } })).toMatchObject({ status: "complete" });
    for (const invalid of [
      { status: "recovered" }, { status: "recovered", unlocked: "true" }, { status: "recovered", unlocked: 1 },
      { status: "recovered", unlocked: true, clientSecret: "pi_old_secret_fixture" },
      { status: "payment", clientSecret: "pi_old_secret_fixture" }, { status: "processing" }, { status: "succeeded" },
    ]) expect(checkoutRecoverySchema.safeParse(invalid).success).toBe(false);
  });
});
