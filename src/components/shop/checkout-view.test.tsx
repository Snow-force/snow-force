import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), change: vi.fn(), reload: vi.fn(), validation: vi.fn() }));
vi.mock("@/lib/shop/checkout-actions", () => ({ getShopCheckoutAction: mocks.get, changeShopCheckoutAction: mocks.change }));
vi.mock("./shop-provider", () => ({ useShopCart: () => ({ reload: mocks.reload }) }));
vi.mock("next/dynamic", () => ({ default: () => ({ validate, onBusyChange }: { validate: () => Promise<boolean>; onBusyChange: (busy: boolean) => void }) => <div>Secure Stripe form<button onClick={() => void validate().then(mocks.validation)}>Validate payment review</button><button onClick={() => onBusyChange(true)}>Start confirmation</button><button onClick={() => onBusyChange(false)}>Finish confirmation</button></div> }));
import { CheckoutView } from "./checkout-view";
import { LanguageProvider } from "@/lib/language";
import type { CheckoutReview } from "@/lib/shop/checkout";
import type { ShopPublishedPolicy } from "@/lib/shop/policies";
const policy: ShopPublishedPolicy = {
  schema_version: 1, version: 3, effective_at: "2026-10-01T12:00:00.000Z",
  content: {
    seller_name: "Fixture Gear LLC", customer_service_email: "support@example.test",
    terms: { return_window_days: 30, approved_dispatch_days: 14, review_business_days: 2, refund_business_days: 5, processing_business_days_min: 1, processing_business_days_max: 2, transit_business_days_min: 3, transit_business_days_max: 7 },
    copy: {
      shipping: { en: "Published shipping terms", zh: "已发布配送条款" },
      requests: { en: "Published request terms", zh: "已发布申请条款" },
      conditions: { en: "Published item conditions", zh: "已发布商品条件" },
      shipping_costs: { en: "Published shipping costs", zh: "已发布运费处理" },
      refunds: { en: "Published refund terms", zh: "已发布退款条款" },
      return_address: { en: "Published return address", zh: "已发布退货地址" },
      consumer_rights: { en: "Published consumer rights", zh: "已发布消费者权利" },
    },
  },
};
const review: CheckoutReview = { status: "review", fingerprint: "a".repeat(64), configured: true, paymentStarted: false, policy, policyAccepted: false, taxQuote: { totalCents: 8990, grossCents: 7995, discountCents: 0, merchandiseCents: 7995, shippingCents: 995, salesTaxCents: 0, fees: [], expiresAt: 2000000000, ready: true }, address: { name: "Test Rider", phone: "5551234567", address1: "Test street", address2: "", city: "Test city", state: "CA", postalCode: "90001", countryCode: "US" }, options: [{ id: "so_fixture", name: "US standard", price: 9.95 }], selectedOptionId: "so_fixture", cart: { items: [{ id: "cali_fixture", name: "Test jacket", variant: "M", image: "/shop/product-placeholder.svg", slug: "test-jacket", quantity: 1, unitPrice: 79.95, total: 79.95 }], subtotal: 79.95, shippingTotal: 9.95, taxTotal: 0, discountTotal: 0, total: 89.9 } };
beforeEach(() => { vi.resetAllMocks(); mocks.get.mockResolvedValue(review); mocks.change.mockResolvedValue(review); mocks.reload.mockResolvedValue(undefined); });
const view = (lang: "en" | "zh" = "en", completing = false) => render(<LanguageProvider initialLang={lang}><CheckoutView completing={completing} /></LanguageProvider>);
describe("checkout interface", () => {
  it("allows address and delivery first, then calculates the quote and requires fresh policy agreement", async () => {
    mocks.get.mockResolvedValue({ ...review, taxQuote: null });
    view();
    const calculate = await screen.findByRole("button", { name: "Calculate tax & review total" });
    expect(calculate).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save address & get delivery options" })).toBeEnabled();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByText("Calculated after tax")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeDisabled();
    fireEvent.click(calculate);
    await screen.findByRole("button", { name: "Refresh tax & total" });
    expect(mocks.change).toHaveBeenCalledWith({ kind: "quote" });
    expect(screen.getByText("$89.90 USD")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeEnabled();
  });
  it("requires a refresh for expired quotes and displays government fees separately in USD", async () => {
    mocks.get.mockResolvedValue({ ...review, taxQuote: { ...review.taxQuote!, totalCents: 9018, fees: [{ state: "CO", amountCents: 28 }], ready: false } });
    view("zh");
    expect(await screen.findByText("$90.18 USD")).toBeInTheDocument();
    expect(screen.getByText("CO 政府配送费")).toBeInTheDocument();
    expect(screen.getByText("$0.28")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认金额并继续付款" })).toBeDisabled();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "更新税费与金额" })).toBeEnabled();
    expect(screen.queryByRole("option", { name: "AK" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "HI" })).not.toBeInTheDocument();
  });
  it("disables a quote when its local expiry arrives without sending an automatic mutation", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
      const expiresAt = Math.floor(Date.now() / 1000) + 2;
      mocks.get.mockResolvedValue({ ...review, taxQuote: { ...review.taxQuote!, expiresAt } });
      await act(async () => { view(); });
      fireEvent.click(screen.getByRole("checkbox"));
      expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeEnabled();
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      expect(screen.getByRole("checkbox")).toBeDisabled();
      expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeDisabled();
      expect(screen.getByText("Your previous quote needs to be refreshed before payment.")).toBeInTheDocument();
      expect(mocks.change).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("invalidates old consent and prevents payment after an address or quote mutation fails", async () => {
    view(); fireEvent.click(await screen.findByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeEnabled();
    mocks.change.mockResolvedValueOnce({ status: "unavailable" });
    fireEvent.click(screen.getByRole("button", { name: "Refresh tax & total" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeDisabled();
  });
  it("starts busy and waits for the authoritative initial checkout", async () => {
    let resolveCheckout: (value: CheckoutReview) => void = () => {
      throw new Error("Checkout request was not initialized.");
    };
    mocks.get.mockReturnValue(new Promise<CheckoutReview>((resolve) => { resolveCheckout = resolve; }));
    view();

    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading checkout");
    await act(async () => { resolveCheckout(review); });

    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeDisabled();
  });

  it("resets the checkout view when entering the payment return flow", async () => {
    const page = view();
    await screen.findByText("Order summary");
    fireEvent.change(screen.getByLabelText("Street address"), { target: { value: "Unsubmitted address" } });
    let resolveCompletion: (value: { status: "complete"; order: { id: string; number: string; total: number } }) => void = () => {
      throw new Error("Completion request was not initialized.");
    };
    mocks.change.mockReturnValue(new Promise<{ status: "complete"; order: { id: string; number: string; total: number } }>((resolve) => { resolveCompletion = resolve; }));

    page.rerender(<LanguageProvider initialLang="en"><CheckoutView completing /></LanguageProvider>);

    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Order summary")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Unsubmitted address")).not.toBeInTheDocument();
    expect(mocks.change).toHaveBeenCalledWith({ kind: "complete" });
    await act(async () => { resolveCompletion({ status: "complete", order: { id: "order_return", number: "1002", total: 89.9 } }); });

    expect(screen.getByText("Order received")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "false");
    expect(mocks.reload).toHaveBeenCalledOnce();
  });

  it("keeps the existing member login and checkout return path", async () => {
    mocks.get.mockResolvedValue({ status: "signed-out" }); view();
    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/member?next=%2Fshop%2Fcheckout");
  });
  it("shows actual USD totals and submits address without an email or amount", async () => {
    view("zh"); await screen.findByText("订单核对");
    expect(screen.getByText("$89.90 USD")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("收件人姓名"), { target: { value: "New Rider" } });
    fireEvent.submit(screen.getByRole("button", { name: "保存地址并查询配送" }).closest("form")!);
    await waitFor(() => expect(mocks.change).toHaveBeenCalledWith({ kind: "address", address: { ...review.address, name: "New Rider" } }));
  });
  it("starts payment from the reviewed fingerprint and renders Stripe only after setup", async () => {
    mocks.change.mockResolvedValue({ status: "payment", clientSecret: "pi_fixture_secret_fixture", publishableKey: "pk_test_fixture", total: 89.9 });
    view(); fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Review & continue to payment" }));
    await screen.findByText("Secure Stripe form");
    expect(mocks.change).toHaveBeenCalledWith({ kind: "payment", fingerprint: review.fingerprint, policyVersion: policy.version, agreed: true });
  });
  it("requires an explicit new agreement and lets the rider withdraw it before payment", async () => {
    view();
    const checkbox = await screen.findByRole("checkbox", { name: /I have read and agree/ });
    const payment = screen.getByRole("button", { name: "Review & continue to payment" });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(payment);
    expect(mocks.change).not.toHaveBeenCalled();
    fireEvent.click(checkbox);
    expect(payment).toBeEnabled();
    fireEvent.click(checkbox);
    expect(payment).toBeDisabled();
  });
  it.each(["en", "zh"] as const)("shows the complete accepted-version policy in %s", async (lang) => {
    view(lang);
    const summary = await screen.findByText(lang === "en" ? /Read shipping, returns and refunds/ : /查看配送、退换货及退款条款/);
    fireEvent.click(summary);
    for (const paragraph of Object.values(policy.content.copy)) expect(screen.getByText(paragraph[lang])).toBeVisible();
    expect(screen.getByText(/Fixture Gear LLC/)).toBeVisible();
    expect(screen.getByRole("link", { name: policy.content.customer_service_email })).toHaveAttribute("href", "mailto:support@example.test");
    expect(screen.getByRole("link", { name: lang === "en" ? "Shop policies page" : "商城政策页面" })).toHaveAttribute("href", "/shop/policies");
    expect(screen.getByText(lang === "en" ? "30 days" : "30 天")).toBeVisible();
    expect(screen.getByText(lang === "en" ? "14 days" : "14 天")).toBeVisible();
    expect(screen.getByText(lang === "en" ? "2 business days" : "2 个工作日")).toBeVisible();
    expect(screen.getByText(lang === "en" ? "5 business days" : "5 个工作日")).toBeVisible();
    expect(screen.getByText(lang === "en" ? "1–2 business days" : "1–2 个工作日")).toBeVisible();
    expect(screen.getByText(lang === "en" ? "3–7 business days" : "3–7 个工作日")).toBeVisible();
  });
  it("blocks payment while no published policy is available", async () => {
    mocks.get.mockResolvedValue({ ...review, policy: null });
    view();
    expect(await screen.findByRole("button", { name: "Review & continue to payment" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Shop policies are being prepared");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Shop policies" })).toHaveAttribute("href", "/shop/policies");
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it("requires new consent when no payment is active even if an earlier acceptance is reported", async () => {
    mocks.get.mockResolvedValue({ ...review, policyAccepted: true });
    view();
    expect(await screen.findByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeDisabled();
  });
  it.each([
    { change: "policy version", updated: { ...review, policy: { ...policy, version: 4 } } },
    { change: "quote fingerprint", updated: { ...review, fingerprint: "b".repeat(64) } },
  ])("invalidates consent when the $change changes", async ({ updated }) => {
    view();
    fireEvent.click(await screen.findByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeEnabled();
    mocks.change.mockResolvedValue(updated);
    fireEvent.submit(screen.getByRole("button", { name: "Save address & get delivery options" }).closest("form")!);
    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeDisabled();
    mocks.change.mockResolvedValue(review);
    fireEvent.submit(screen.getByRole("button", { name: "Save address & get delivery options" }).closest("form")!);
    await waitFor(() => expect(mocks.change).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "false"));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("requires fresh consent after an address save even if the returned amounts are identical", async () => {
    view(); fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.submit(screen.getByRole("button", { name: "Save address & get delivery options" }).closest("form")!);
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "false"));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeDisabled();
  });
  it("resumes the policy version accepted when the payment began", async () => {
    const original = { ...policy, version: 1, effective_at: "2026-09-01T12:00:00.000Z" };
    mocks.get.mockResolvedValue({ ...review, policy: original, paymentStarted: true, policyAccepted: true });
    mocks.change.mockResolvedValue({ status: "payment", clientSecret: "pi_fixture_secret_fixture", publishableKey: "pk_test_fixture", total: 89.9 });
    view();
    const payment = await screen.findByRole("button", { name: "Resume payment" });
    expect(payment).toBeEnabled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText(/You accepted policy version 1/)).toHaveAttribute("role", "status");
    fireEvent.click(payment);
    await screen.findByText("Secure Stripe form");
    expect(mocks.change).toHaveBeenCalledWith({ kind: "payment", fingerprint: review.fingerprint, policyVersion: 1, agreed: true });
  });
  it("blocks a started payment whose earlier consent cannot be verified", async () => {
    mocks.get.mockResolvedValue({ ...review, paymentStarted: true, policyAccepted: false });
    view();
    expect(await screen.findByRole("button", { name: "Resume payment" })).toBeDisabled();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("couldn't verify the policy");
  });
  it("checks the latest policy-bound quote before Stripe continues", async () => {
    mocks.change.mockResolvedValue({ status: "payment", clientSecret: "pi_fixture_secret_fixture", publishableKey: "pk_test_fixture", total: 89.9 });
    view(); fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Review & continue to payment" }));
    await screen.findByText("Secure Stripe form");
    mocks.get.mockResolvedValue({ ...review, policy: { ...policy, version: 4 }, fingerprint: "b".repeat(64) });
    fireEvent.click(screen.getByRole("button", { name: "Validate payment review" }));
    await waitFor(() => expect(mocks.validation).toHaveBeenCalledWith(false));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeDisabled();
    expect(screen.queryByText("Secure Stripe form")).not.toBeInTheDocument();
  });
  it("allows Stripe to continue when the accepted quote remains configured and unchanged", async () => {
    mocks.change.mockResolvedValue({ status: "payment", clientSecret: "pi_fixture_secret_fixture", publishableKey: "pk_test_fixture", total: 89.9 });
    view(); fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Review & continue to payment" }));
    await screen.findByText("Secure Stripe form");
    mocks.get.mockResolvedValue({ ...review, paymentStarted: true, policyAccepted: true });
    fireEvent.click(screen.getByRole("button", { name: "Validate payment review" }));
    await waitFor(() => expect(mocks.validation).toHaveBeenCalledWith(true));
    expect(screen.getByText("Secure Stripe form")).toBeInTheDocument();
    expect(mocks.change).toHaveBeenCalledOnce();
  });
  it("keeps the configuration check before Stripe continues", async () => {
    mocks.change.mockResolvedValue({ status: "payment", clientSecret: "pi_fixture_secret_fixture", publishableKey: "pk_test_fixture", total: 89.9 });
    view(); fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Review & continue to payment" }));
    await screen.findByText("Secure Stripe form");
    mocks.get.mockResolvedValue({ ...review, configured: false });
    fireEvent.click(screen.getByRole("button", { name: "Validate payment review" }));
    await waitFor(() => expect(mocks.validation).toHaveBeenCalledWith(false));
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeDisabled();
  });
  it("requires an edited address to be saved before shipping selection or payment", async () => {
    view(); await screen.findByLabelText("Street address");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Street address"), { target: { value: "Updated test street" } });
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeDisabled();
    expect(screen.getByText("Save your updated address before paying.")).toBeInTheDocument();
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it("prevents payment while tax or delivery configuration is missing", async () => {
    mocks.get.mockResolvedValue({ ...review, configured: false }); view();
    expect(await screen.findByRole("button", { name: "Review & continue to payment" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Delivery, tax and payment configuration");
  });
  it("freezes editing and offers resume after payment begins", async () => {
    mocks.get.mockResolvedValue({ ...review, paymentStarted: true, policyAccepted: true }); view();
    expect(await screen.findByRole("button", { name: "Resume payment" })).toBeEnabled();
    expect(screen.getByLabelText("Recipient name")).toBeDisabled();
    expect(screen.getByRole("radio", { name: /US standard/ })).toBeDisabled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
  it("does not treat redirect parameters as proof and confirms the native order", async () => {
    window.history.replaceState(null, "", "/shop/checkout/return?redirect_status=succeeded&payment_intent_client_secret=untrusted");
    mocks.change.mockResolvedValue({ status: "complete", order: { id: "order_fixture", number: "1001", total: 89.9 } });
    view("en", true);
    expect(await screen.findByText("Order received")).toBeInTheDocument();
    expect(mocks.change).toHaveBeenCalledWith({ kind: "complete" });
    expect(window.location.search).toBe("");
    await waitFor(() => expect(mocks.reload).toHaveBeenCalled());
  });
  it("keeps pending payments pending and offers an authoritative status check", async () => {
    mocks.change.mockResolvedValue({ status: "processing" }); view("en", true);
    expect(await screen.findByText("Verifying your order")).toBeInTheDocument();
    expect(screen.queryByText("Order received")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check order status" }));
    await waitFor(() => expect(mocks.change).toHaveBeenCalledTimes(2));
  });
  it("unmounts the old payment secret while checking and requires fresh agreement even for the same quote and policy", async () => {
    mocks.change.mockResolvedValueOnce({ status: "payment", clientSecret: "pi_old_secret_fixture", publishableKey: "pk_test_fixture", total: 89.9 });
    view(); fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Review & continue to payment" }));
    await screen.findByText("Secure Stripe form");
    let release: (value: CheckoutReview) => void = () => { throw new Error("Payment check was not started."); };
    mocks.change.mockReturnValueOnce(new Promise<CheckoutReview>((resolve) => { release = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Check payment status" }));
    expect(mocks.change).toHaveBeenLastCalledWith({ kind: "recover" });
    expect(screen.queryByText("Secure Stripe form")).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Check payment status" })).toBeDisabled();
    await act(async () => { release({ ...review, paymentCheck: "unlocked" }); });
    expect(screen.getByText(/The previous payment was canceled/)).toHaveAttribute("role", "status");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeDisabled();
    expect(screen.getByLabelText("Recipient name")).toBeEnabled();
    expect(screen.queryByText("Secure Stripe form")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review & continue to payment" }));
    expect(mocks.change).toHaveBeenCalledTimes(2);
  });
  it("keeps an active original payment frozen and lets the rider resume it after checking", async () => {
    const started = { ...review, paymentStarted: true, policyAccepted: true };
    mocks.get.mockResolvedValue(started);
    mocks.change.mockResolvedValueOnce({ ...started, paymentCheck: "active" });
    view(); fireEvent.click(await screen.findByRole("button", { name: "Check payment status" }));
    expect(await screen.findByText("Your original payment is still active. Continue that payment or check order status if it is processing.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume payment" })).toBeEnabled();
    expect(screen.getByLabelText("Recipient name")).toBeDisabled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    mocks.change.mockResolvedValueOnce({ status: "payment", clientSecret: "pi_same_secret_fixture", publishableKey: "pk_test_fixture", total: 89.9 });
    fireEvent.click(screen.getByRole("button", { name: "Resume payment" }));
    await screen.findByText("Secure Stripe form");
    expect(mocks.change).toHaveBeenLastCalledWith({ kind: "payment", fingerprint: review.fingerprint, policyVersion: policy.version, agreed: true });
  });
  it("prevents status recovery while Stripe is submitting or confirming", async () => {
    mocks.change.mockResolvedValue({ status: "payment", clientSecret: "pi_old_secret_fixture", publishableKey: "pk_test_fixture", total: 89.9 });
    view(); fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Review & continue to payment" }));
    await screen.findByText("Secure Stripe form");
    fireEvent.click(screen.getByRole("button", { name: "Start confirmation" }));
    const check = screen.getByRole("button", { name: "Check payment status" });
    expect(check).toBeDisabled(); fireEvent.click(check);
    expect(mocks.change).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Finish confirmation" }));
    expect(check).toBeEnabled();
  });
  it("rejects a delayed old form validation after recovery has removed that payment", async () => {
    mocks.change.mockResolvedValueOnce({ status: "payment", clientSecret: "pi_old_secret_fixture", publishableKey: "pk_test_fixture", total: 89.9 });
    view(); fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Review & continue to payment" }));
    await screen.findByText("Secure Stripe form");
    let release: (value: CheckoutReview) => void = () => { throw new Error("Validation was not started."); };
    mocks.get.mockReturnValueOnce(new Promise<CheckoutReview>((resolve) => { release = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Validate payment review" }));
    mocks.change.mockResolvedValueOnce({ ...review, paymentCheck: "unlocked" });
    fireEvent.click(screen.getByRole("button", { name: "Check payment status" }));
    await screen.findByRole("checkbox");
    await act(async () => { release({ ...review, paymentStarted: true, policyAccepted: true }); });
    expect(mocks.validation).toHaveBeenLastCalledWith(false);
    expect(screen.queryByText("Secure Stripe form")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it.each(["unavailable", "rejected"] as const)("keeps the old Elements form removed after a %s recovery failure", async (status) => {
    mocks.change.mockResolvedValueOnce({ status: "payment", clientSecret: "pi_old_secret_fixture", publishableKey: "pk_test_fixture", total: 89.9 });
    view(); fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Review & continue to payment" }));
    await screen.findByText("Secure Stripe form");
    mocks.change.mockResolvedValueOnce({ status });
    fireEvent.click(screen.getByRole("button", { name: "Check payment status" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Secure Stripe form")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check payment status" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Resume payment" })).not.toBeInTheDocument();
  });
  it("offers recovery when checkout cannot load and returns to the existing sign-in flow if ownership expires", async () => {
    mocks.get.mockResolvedValue({ status: "unavailable" });
    mocks.change.mockResolvedValueOnce({ status: "signed-out" });
    view("zh");
    fireEvent.click(await screen.findByRole("button", { name: "检查付款状态" }));
    expect(await screen.findByRole("link", { name: "会员登录" })).toHaveAttribute("href", "/member?next=%2Fshop%2Fcheckout");
    expect(screen.queryByRole("button", { name: "检查付款状态" })).not.toBeInTheDocument();
  });
  it("checks processing payments through recovery while preserving the existing completion check", async () => {
    mocks.change.mockResolvedValueOnce({ status: "processing" }); view("en", true);
    const check = await screen.findByRole("button", { name: "Check payment status" });
    expect(screen.getByRole("button", { name: "Check order status" })).toBeEnabled();
    mocks.change.mockResolvedValueOnce({ status: "complete", order: { id: "order_fixture", number: "1001", total: 89.9 } });
    fireEvent.click(check);
    expect(await screen.findByText("Order received")).toBeInTheDocument();
    expect(mocks.change).toHaveBeenLastCalledWith({ kind: "recover" });
    expect(mocks.reload).toHaveBeenCalledOnce();
  });
});
