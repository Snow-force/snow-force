import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), change: vi.fn(), reload: vi.fn(), sync: vi.fn(), validation: vi.fn(), preview: vi.fn(), cancel: vi.fn(), warm: vi.fn(), selectWarm: vi.fn() }));
vi.mock("@/lib/shop/stripe-loader", () => ({ loadCheckoutStripe: mocks.warm, selectStripeWarmup: mocks.selectWarm }));
vi.mock("./stripe-checkout-form", () => ({ default: () => null }));
vi.mock("@/lib/shop/cart-actions", () => ({ previewShopPaymentCancellationAction: mocks.preview, cancelUnpaidCartPaymentAction: mocks.cancel }));
vi.mock("@/lib/shop/checkout-actions", () => ({ getShopCheckoutAction: mocks.get, changeShopCheckoutAction: mocks.change }));
vi.mock("./shop-provider", () => ({ useShopCart: () => ({ reload: mocks.reload, syncCheckout: mocks.sync }) }));
vi.mock("next/dynamic", () => ({ default: () => ({ validate, onBusyChange }: { validate: () => Promise<boolean>; onBusyChange: (busy: boolean) => void }) => <div>Secure Stripe form<button onClick={() => void validate().then(mocks.validation)}>Validate payment review</button><button onClick={() => onBusyChange(true)}>Start confirmation</button><button onClick={() => onBusyChange(false)}>Finish confirmation</button></div> }));
import { CheckoutView } from "./checkout-view";
import { LanguageProvider } from "@/lib/language";
import type { CheckoutPreview, CheckoutReview } from "@/lib/shop/checkout";
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
beforeEach(() => {
  vi.resetAllMocks(); mocks.get.mockResolvedValue(review); mocks.change.mockResolvedValue(review); mocks.reload.mockResolvedValue(undefined);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
const view = (lang: "en" | "zh" = "en", completing = false) => render(<LanguageProvider initialLang={lang}><CheckoutView completing={completing} /></LanguageProvider>);
afterEach(() => vi.useRealTimers());
describe("checkout interface", () => {
  it("warms only selected checkout visits while server reads are pending, without preparing a payment", async () => {
    mocks.selectWarm.mockReturnValue(true); mocks.warm.mockResolvedValue({}); mocks.get.mockReturnValue(new Promise(() => undefined));
    const rendered = render(<LanguageProvider initialLang="en"><CheckoutView warmup={{publishableKey:"pk_test_fixture",sampleRate:.1}} /></LanguageProvider>);
    await waitFor(() => expect(mocks.warm).toHaveBeenCalledExactlyOnceWith("pk_test_fixture")); expect(mocks.get).toHaveBeenCalledOnce(); expect(mocks.change).not.toHaveBeenCalled();
    rendered.rerender(<LanguageProvider initialLang="en"><CheckoutView warmup={{publishableKey:"pk_test_fixture",sampleRate:.1}} /></LanguageProvider>);
    expect(mocks.warm).toHaveBeenCalledOnce(); expect(screen.queryByText("Secure Stripe form")).not.toBeInTheDocument();
  });
  it("leaves the old loading path for unselected visits and never prewarms a payment return", async () => {
    mocks.selectWarm.mockReturnValue(false); view(); await screen.findByLabelText("Recipient name"); expect(mocks.warm).not.toHaveBeenCalled();
  });
  it("does not prewarm on payment return even when the rollout selects every checkout", async () => {
    mocks.selectWarm.mockReturnValue(true); mocks.change.mockResolvedValue({status:"processing"});
    render(<LanguageProvider initialLang="en"><CheckoutView completing warmup={{publishableKey:"pk_test_fixture",sampleRate:1}} /></LanguageProvider>);
    await waitFor(() => expect(mocks.change).toHaveBeenCalled()); expect(mocks.warm).not.toHaveBeenCalled();
  });
  const previewResult = (name="Draft Rider",expiresAt=2000000000):CheckoutPreview => ({status:"preview",cart:review.cart,token:"draft1."+"a".repeat(20)+"."+"b".repeat(20)+"."+"c".repeat(20),fingerprint:"d".repeat(64),version:"a".repeat(64),taxQuote:{...review.taxQuote!,ready:false,expiresAt},options:review.options,selectedOptionId:review.selectedOptionId!,address:{...review.address!,name},pickupSelected:false,policy});
  it("uses an unapplied estimate for edited details and only prepares payment after explicit agreement",async()=>{
    vi.useFakeTimers();const initial={...review,draftsEnabled:true,detailsVersion:"a".repeat(64)};mocks.get.mockResolvedValue(initial);
    const estimate=previewResult();mocks.change.mockResolvedValueOnce(estimate).mockResolvedValue({status:"payment",clientSecret:"pi_fixture_secret_fixture",publishableKey:"pk_test_fixture",total:89.9,review:{...initial,address:estimate.address,paymentStarted:true,policyAccepted:true}});
    await act(async()=>{view();});fireEvent.change(screen.getByLabelText("Recipient name"),{target:{value:"Draft Rider"}});
    await act(async()=>{await vi.advanceTimersByTimeAsync(900);});
    expect(mocks.change).toHaveBeenCalledExactlyOnceWith({kind:"preview",draft:{kind:"delivery",version:"a".repeat(64),address:estimate.address}});
    expect(screen.getByText("Estimated total")).toBeVisible();expect(screen.getByText("Shipping and tax estimated. Availability and the exact total are checked before payment.")).toBeVisible();
    expect(screen.getByRole("checkbox")).not.toBeChecked();expect(screen.getByRole("button",{name:"Review & continue to payment"})).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Review & continue to payment"}));});
    expect(mocks.change).toHaveBeenLastCalledWith({kind:"draft-payment",token:estimate.token,policyVersion:policy.version,agreed:true});expect(screen.getByText("Secure Stripe form")).toBeVisible();expect(screen.queryByText("Estimated total")).not.toBeInTheDocument();
  });
  it("ignores an older estimate, keeps typing enabled and requests only the latest queued draft",async()=>{
    vi.useFakeTimers();mocks.get.mockResolvedValue({...review,draftsEnabled:true,detailsVersion:"a".repeat(64)});
    let finish!:(value:CheckoutPreview)=>void;mocks.change.mockReturnValueOnce(new Promise<CheckoutPreview>(resolve=>{finish=resolve;})).mockResolvedValue(previewResult("Newest Rider"));
    await act(async()=>{view();});const name=screen.getByLabelText("Recipient name");fireEvent.change(name,{target:{value:"First Rider"}});await act(async()=>{await vi.advanceTimersByTimeAsync(900);});expect(name).toBeEnabled();
    fireEvent.change(name,{target:{value:"Intermediate Rider"}});fireEvent.change(name,{target:{value:"Newest Rider"}});await act(async()=>{finish(previewResult("First Rider"));});
    expect(name).toHaveValue("Newest Rider");expect(screen.queryByText("Estimated total")).not.toBeInTheDocument();
    await act(async()=>{await vi.advanceTimersByTimeAsync(900);});expect(mocks.change).toHaveBeenCalledTimes(2);expect(mocks.change).toHaveBeenLastCalledWith({kind:"preview",draft:{kind:"delivery",version:"a".repeat(64),address:{...review.address!,name:"Newest Rider"}}});expect(screen.getByText("Estimated total")).toBeVisible();
  });
  it("accepts an equivalent newest preview draft without another request or replacing raw typing",async()=>{
    vi.useFakeTimers();mocks.get.mockResolvedValue({...review,draftsEnabled:true,detailsVersion:"a".repeat(64)});let finish!:(value:CheckoutPreview)=>void;mocks.change.mockReturnValue(new Promise<CheckoutPreview>(resolve=>{finish=resolve;}));
    await act(async()=>{view();});const name=screen.getByLabelText("Recipient name");fireEvent.change(name,{target:{value:"Draft Rider"}});await act(async()=>{await vi.advanceTimersByTimeAsync(900);});fireEvent.change(name,{target:{value:" Draft   Rider "}});await act(async()=>{finish(previewResult());});await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
    expect(name).toHaveValue(" Draft   Rider ");expect(mocks.change).toHaveBeenCalledTimes(1);expect(screen.getByRole("checkbox")).toBeEnabled();
  });
  it("refreshes an estimate before expiry without making the native cart payable",async()=>{
    vi.useFakeTimers();mocks.get.mockResolvedValue({...review,draftsEnabled:true,detailsVersion:"a".repeat(64)});const expiry=Math.floor(Date.now()/1000)+62;mocks.change.mockResolvedValueOnce(previewResult("Draft Rider",expiry)).mockResolvedValue(previewResult());
    await act(async()=>{view();});fireEvent.change(screen.getByLabelText("Recipient name"),{target:{value:"Draft Rider"}});await act(async()=>{await vi.advanceTimersByTimeAsync(900);});fireEvent.click(screen.getByRole("checkbox"));
    await act(async()=>{await vi.advanceTimersByTimeAsync(1500);});expect(screen.getByRole("checkbox")).toBeDisabled();await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});expect(mocks.change).toHaveBeenCalledTimes(2);expect(mocks.change.mock.calls.every(([command])=>command.kind==="preview")).toBe(true);expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("blocks an invalid latest address while retaining a completed old estimate",async()=>{
    vi.useFakeTimers();mocks.get.mockResolvedValue({...review,draftsEnabled:true,detailsVersion:"a".repeat(64)});mocks.change.mockResolvedValue(previewResult());await act(async()=>{view();});fireEvent.change(screen.getByLabelText("Recipient name"),{target:{value:"Draft Rider"}});await act(async()=>{await vi.advanceTimersByTimeAsync(900);});fireEvent.change(screen.getByLabelText("Street address"),{target:{value:"   "}});await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});expect(mocks.change).toHaveBeenCalledTimes(1);expect(screen.getByRole("checkbox")).toBeDisabled();expect(screen.getByRole("button",{name:"Review & continue to payment"})).toBeDisabled();
  });
  it("previews pickup after appointment confirmation without comparing hidden delivery fields",async()=>{
    vi.useFakeTimers();const pickupOffer={id:"so_pickup",locationId:"sloc_fixture",name:"Fixture warehouse",address:{address_1:"1 Fixture Plaza",address_2:null,city:"Irvine",province:"ca" as const,postal_code:"92614",country_code:"us" as const}};
    mocks.get.mockResolvedValue({...review,draftsEnabled:true,detailsVersion:"a".repeat(64),pickupOffer});
    mocks.change.mockResolvedValue({...previewResult("Test Rider"),pickupSelected:true,selectedOptionId:pickupOffer.id,options:[],address:{...review.address!,address1:"1 Fixture Plaza",city:"Irvine",postalCode:"92614"},taxQuote:{...review.taxQuote!,ready:false,totalCents:7995,shippingCents:0}});
    await act(async()=>{view();});fireEvent.click(screen.getByRole("radio",{name:"Appointment pickup · Free"}));await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});expect(mocks.change).not.toHaveBeenCalled();expect(screen.getByText("Confirm pickup details")).toBeVisible();expect(screen.getByText(/Confirm your pickup contact and appointment to calculate tax/)).toBeVisible();expect(screen.queryByText("Complete your address")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox",{name:"I have contacted SnowForce and confirmed my pickup appointment at this location."}));await act(async()=>{await vi.advanceTimersByTimeAsync(900);});await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
    expect(mocks.change).toHaveBeenCalledExactlyOnceWith({kind:"preview",draft:{kind:"pickup",version:"a".repeat(64),contact:{name:"Test Rider",phone:"5551234567",appointmentConfirmed:true}}});expect(screen.getByRole("checkbox",{name:/I have read and agree/})).toBeEnabled();expect(screen.getByText("Estimated total")).toBeVisible();
  });
  it("keeps a failed estimate distinct from a revision conflict and retries after a new edit",async()=>{
    vi.useFakeTimers();mocks.get.mockResolvedValue({...review,draftsEnabled:true,detailsVersion:"a".repeat(64)});mocks.change.mockResolvedValueOnce({status:"estimate-unavailable"}).mockResolvedValue(previewResult("Newest Rider"));await act(async()=>{view();});const name=screen.getByLabelText("Recipient name");fireEvent.change(name,{target:{value:"Draft Rider"}});await act(async()=>{await vi.advanceTimersByTimeAsync(900);});expect(screen.getByRole("alert")).toHaveTextContent("We couldn’t verify a shipping and tax estimate.");expect(screen.queryByRole("button",{name:"Keep my details & retry"})).not.toBeInTheDocument();expect(screen.getByRole("button",{name:"Review & continue to payment"})).toBeDisabled();
    fireEvent.change(name,{target:{value:"Newest Rider"}});await act(async()=>{await vi.advanceTimersByTimeAsync(900);});expect(mocks.change).toHaveBeenCalledTimes(2);expect(screen.getByText("Estimated total")).toBeVisible();
  });
  it("does not save or recalculate an address when only server-trimmed whitespace changes", async () => {
    vi.useFakeTimers();
    await act(async () => { view(); });
    for (const [label, value] of [["Recipient name", " Test Rider "], ["Street address", " Test street "], ["Apartment, suite (optional)", "   "], ["City", " Test city "], ["ZIP code", " 90001 "]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(mocks.change).not.toHaveBeenCalled();
    expect(screen.getByText("Shipping and tax included. Your total is up to date.")).toBeVisible();
    expect(screen.getByRole("checkbox")).toBeEnabled();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByLabelText("Street address")).toHaveValue(" Test street ");
  });
  it("keeps an equivalent newest draft after an in-flight save without queuing a second tax calculation", async () => {
    vi.useFakeTimers();
    const initial = { ...review, detailsVersion: "a".repeat(64) }; mocks.get.mockResolvedValue(initial);
    let finish!: (value: CheckoutReview) => void;
    mocks.change.mockReturnValue(new Promise<CheckoutReview>(resolve => { finish = resolve; }));
    await act(async () => { view(); });
    const street = screen.getByLabelText("Street address");
    fireEvent.change(street, { target: { value: "New street" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(mocks.change).toHaveBeenCalledTimes(1);
    fireEvent.change(street, { target: { value: " New street " } });
    await act(async () => { finish({ ...initial, address: { ...review.address!, address1: "New street" }, detailsVersion: "b".repeat(64) }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(street).toHaveValue(" New street ");
    expect(mocks.change).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Shipping and tax included. Your total is up to date.")).toBeVisible();
  });
  it("keeps invalid whitespace-only required fields unpayable without submitting them", async () => {
    vi.useFakeTimers();
    await act(async () => { view(); });
    fireEvent.change(screen.getByLabelText("Recipient name"), { target: { value: "   " } });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(mocks.change).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeDisabled();
  });
  it("still refreshes an expired quote for an equivalent whitespace-edited address", async () => {
    vi.useFakeTimers();
    mocks.get.mockResolvedValue({ ...review, taxQuote: { ...review.taxQuote!, ready: false } });
    await act(async () => { view(); });
    fireEvent.change(screen.getByLabelText("Apartment, suite (optional)"), { target: { value: "  " } });
    expect(screen.getByRole("checkbox")).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(mocks.change).toHaveBeenCalledExactlyOnceWith({ kind: "quote" });
    expect(screen.getByText("Shipping and tax included. Your total is up to date.")).toBeVisible();
  });
  it("serializes address saves, keeps typing responsive and saves only the newest queued draft", async () => {
    vi.useFakeTimers();
    const initial = { ...review, detailsVersion: "a".repeat(64) };
    mocks.get.mockResolvedValue(initial);
    let first!: (value: CheckoutReview) => void;
    let second!: (value: CheckoutReview) => void;
    mocks.change.mockReturnValueOnce(new Promise<CheckoutReview>(resolve => { first = resolve; })).mockReturnValueOnce(new Promise<CheckoutReview>(resolve => { second = resolve; }));
    await act(async () => { view(); }); const name = screen.getByLabelText("Recipient name");
    fireEvent.change(name, { target: { value: "First draft" } });
    await act(async () => { vi.advanceTimersByTime(900); }); expect(mocks.change).toHaveBeenCalledTimes(1);
    expect(name).toBeEnabled();
    fireEvent.change(name, { target: { value: "Intermediate draft" } });
    fireEvent.change(name, { target: { value: "Newest draft" } });
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeDisabled();
    expect(mocks.change).toHaveBeenCalledTimes(1);
    await act(async () => { first({ ...initial, detailsVersion: "b".repeat(64), address: { ...review.address!, name: "First draft" } }); });
    expect(name).toHaveValue("Newest draft");
    await act(async () => { vi.advanceTimersByTime(900); }); expect(mocks.change).toHaveBeenCalledTimes(2);
    expect(mocks.change).toHaveBeenLastCalledWith({ kind: "delivery", address: { ...review.address!, name: "Newest draft" }, version: "b".repeat(64) });
    await act(async () => { second({ ...initial, detailsVersion: "c".repeat(64), address: { ...review.address!, name: "Newest draft" } }); });
    expect(name).toHaveValue("Newest draft");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.queryByText(/Saving your checkout details/)).not.toBeInTheDocument();
  });
  it("preserves an incomplete newest draft without silently retrying or restoring a payable quote", async () => {
    vi.useFakeTimers();
    const initial = { ...review, detailsVersion: "a".repeat(64) }; mocks.get.mockResolvedValue(initial);
    let finish!: (value: CheckoutReview) => void;
    mocks.change.mockReturnValue(new Promise<CheckoutReview>(resolve => { finish = resolve; }));
    await act(async () => { view(); }); const street = screen.getByLabelText("Street address");
    fireEvent.change(street, { target: { value: "First valid street" } });
    await act(async () => { vi.advanceTimersByTime(900); }); expect(mocks.change).toHaveBeenCalledTimes(1);
    fireEvent.change(street, { target: { value: "" } });
    await act(async () => { finish({ ...initial, address: { ...review.address!, address1: "First valid street" }, detailsVersion: "b".repeat(64) }); });
    expect(street).toHaveValue(""); expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeDisabled();
    expect(mocks.change).toHaveBeenCalledTimes(1);
  });
  it("stops automatic retries on another tab's revision conflict and keeps the local draft", async () => {
    vi.useFakeTimers();
    mocks.get.mockResolvedValue({ ...review, detailsVersion: "a".repeat(64) });
    mocks.change.mockResolvedValue({ status: "stale-details" });
    await act(async () => { view(); }); const name = screen.getByLabelText("Recipient name"); fireEvent.change(name, { target: { value: "My local draft" } });
    await act(async () => { vi.advanceTimersByTime(900); });
    expect(screen.getByRole("button", { name: "Keep my details & retry" })).toBeEnabled();
    expect(name).toHaveValue("My local draft"); expect(mocks.change).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Use latest saved details" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeDisabled();
  });
  it("queues the newest pickup choice behind a delivery save without restoring the old receiving mode", async () => {
    vi.useFakeTimers();
    const pickupOffer = { id: "so_pickup", locationId: "sloc_fixture", name: "Fixture warehouse", address: { address_1: "1 Fixture Plaza", address_2: null, city: "Irvine", province: "ca" as const, postal_code: "92614", country_code: "us" as const } };
    const initial = { ...review, detailsVersion: "a".repeat(64), pickupOffer }; mocks.get.mockResolvedValue(initial);
    let first!: (value: CheckoutReview) => void;
    mocks.change.mockReturnValueOnce(new Promise<CheckoutReview>(resolve => { first = resolve; })).mockResolvedValue({ ...initial, detailsVersion: "c".repeat(64), pickupSelected: true, address: { ...review.address!, name: "Newest Rider", address1: "1 Fixture Plaza" } });
    await act(async () => { view(); }); fireEvent.change(screen.getByLabelText("Recipient name"), { target: { value: "Newest Rider" } });
    await act(async () => { vi.advanceTimersByTime(900); }); expect(mocks.change).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("radio", { name: "Appointment pickup · Free" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "I have contacted SnowForce and confirmed my pickup appointment at this location." }));
    await act(async () => { first({ ...initial, detailsVersion: "b".repeat(64), address: { ...review.address!, name: "Newest Rider" } }); });
    expect(screen.getByRole("radio", { name: "Appointment pickup · Free" })).toBeChecked();
    await act(async () => { vi.advanceTimersByTime(900); }); expect(mocks.change).toHaveBeenCalledTimes(2);
    expect(mocks.change).toHaveBeenLastCalledWith({ kind: "pickup-review", contact: { name: "Newest Rider", phone: "5551234567", appointmentConfirmed: true }, version: "b".repeat(64) });
    expect(screen.getByLabelText("Pickup name")).toHaveValue("Newest Rider");
  });
  it("discards the old payment form before cancellation and preserves a pending retry", async () => {
    mocks.get.mockResolvedValue({ ...review, paymentStarted: true, policyAccepted: true });
    mocks.change.mockResolvedValue({ status: "payment", clientSecret: "pi_fixture_secret_fixture", totalCents: 8990, currency: "usd" });
    mocks.preview.mockResolvedValue({ status: "checkout-locked", cancellation: { status: "confirmation-required", token: "a".repeat(64), amountCents: 8990, currency: "usd" } });
    mocks.cancel.mockResolvedValueOnce({ status: "checkout-locked", cancellation: { status: "pending", code: "recovery-pending" } }).mockResolvedValue({ status: "ready", cart: review.cart });
    view(); fireEvent.click(await screen.findByRole("button", { name: "Resume payment" }));
    await screen.findByText("Secure Stripe form");
    fireEvent.click(screen.getByRole("button", { name: "Cancel unfinished payment & edit checkout" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel unpaid payment & edit" }));
    await screen.findByRole("button", { name: "Check cancellation & retry" });
    expect(screen.queryByText("Secure Stripe form")).not.toBeInTheDocument();
    expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith({ token: "a".repeat(64), confirmed: true });
    mocks.get.mockResolvedValue(review); fireEvent.click(screen.getByRole("button", { name: "Check cancellation & retry" }));
    await waitFor(() => { expect(screen.getByLabelText("Recipient name")).toBeEnabled(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); });
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("recalculates the same saved details after each verified payment cancellation", async () => {
    vi.useFakeTimers();
    const initial = { ...review, draftsEnabled: true, detailsVersion: "a".repeat(64), taxQuote: null };
    mocks.get.mockResolvedValue(initial);
    mocks.change.mockImplementation(async input => input.kind === "preview" ? previewResult("Test Rider") : { status: "payment", clientSecret: "pi_fixture_secret_fixture", totalCents: 8990, currency: "usd", review: { ...initial, paymentStarted: true, policyAccepted: true } });
    mocks.preview.mockResolvedValue({ status: "checkout-locked", cancellation: { status: "confirmation-required", token: "a".repeat(64), amountCents: 8990, currency: "usd" } });
    mocks.cancel.mockResolvedValue({ status: "ready", cart: review.cart });
    await act(async () => { view(); });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(900); });
      expect(screen.getByRole("checkbox")).toBeEnabled();
      fireEvent.click(screen.getByRole("checkbox"));
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Review & continue to payment" })); });
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Cancel unfinished payment & edit checkout" })); });
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Cancel unpaid payment & edit" })); });
      expect(screen.getByRole("checkbox")).not.toBeChecked();
      expect(screen.queryByText("Secure Stripe form")).not.toBeInTheDocument();
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(mocks.change.mock.calls.filter(([input]) => input.kind === "preview")).toHaveLength(3);
    expect(screen.getByRole("checkbox")).toBeEnabled();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(mocks.cancel).toHaveBeenCalledTimes(2);
  });
  it("keeps compact help and policy links on the focused checkout surface", async () => {
    view();
    const help = await screen.findByRole("navigation", { name: "Checkout help and policies" });
    expect(help).toHaveTextContent("Shipping & returns");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy-policy");
  });
  it("announces an automatic save and blocks repeated writes until it finishes", async () => {
    let finish!: (value: CheckoutReview) => void;
    mocks.change.mockReturnValue(new Promise<CheckoutReview>(resolve => { finish = resolve; }));
    view();
    fireEvent.change(await screen.findByLabelText("Recipient name"), { target: { value: "Updated Rider" } });
    await waitFor(() => expect(mocks.change).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(await screen.findByText(/Saving your checkout details/)).toHaveAttribute("role", "status");
    expect(screen.getByLabelText("Recipient name")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Save address/ })).not.toBeInTheDocument();
    await act(async () => { finish({ ...review, address: { ...review.address!, name: "Updated Rider" } }); });
    expect(screen.getByLabelText("Recipient name")).toBeEnabled();
    expect(screen.queryByText(/Saving your checkout details/)).not.toBeInTheDocument();
  });
  it("requires an appointment confirmation before automatically saving pickup and calculating tax", async () => {
    const pickupOffer = { id: "so_pickup", locationId: "sloc_fixture", name: "Fixture Irvine warehouse", address: { address_1: "1 Fixture Plaza", address_2: null, city: "Irvine", province: "ca" as const, postal_code: "92614", country_code: "us" as const } };
    mocks.get.mockResolvedValue({ ...review, pickupOffer });
    mocks.change.mockResolvedValue({ ...review, pickupOffer, pickupSelected: true, selectedOptionId: pickupOffer.id, options: [], address: { ...review.address!, address1: "1 Fixture Plaza", city: "Irvine", postalCode: "92614" } });
    view();
    fireEvent.click(await screen.findByRole("radio", { name: "Appointment pickup · Free" }));
    expect(screen.queryByLabelText("Street address")).not.toBeInTheDocument();
    expect(mocks.change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: "I have contacted SnowForce and confirmed my pickup appointment at this location." }));
    await waitFor(() => expect(mocks.change).toHaveBeenCalledWith({ kind: "pickup-review", contact: { name: "Test Rider", phone: "5551234567", appointmentConfirmed: true } }), { timeout: 2000 });
    await screen.findByText("Free pickup saved. Collect your order at your confirmed appointment; customer service will confirm it is ready.");
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Delivery" }));
    expect(screen.getByLabelText("Street address")).toHaveValue("");
    expect(screen.queryByText(/Delivery is unavailable/)).not.toBeInTheDocument();
    expect(screen.queryByText("$89.90 USD")).not.toBeInTheDocument();
    expect(screen.getByText("Available delivery and tax appear automatically after your address is complete.")).toBeVisible();
    expect(screen.getByText("Recalculating after your details are complete")).toBeVisible();
  });
  it("locks the pickup contact and receiving mode after a payment starts", async () => {
    mocks.get.mockResolvedValue({ ...review, paymentStarted: true, policyAccepted: true, pickupSelected: true, pickupOffer: { id: "so_pickup", locationId: "sloc_fixture", name: "Fixture point", address: { address_1: "Test plaza", address_2: null, city: "Irvine", province: "ca", postal_code: "92614", country_code: "us" } } });
    view();
    expect(await screen.findByRole("radio", { name: "Appointment pickup · Free" })).toBeDisabled();
    expect(screen.getByLabelText("Pickup name")).toBeDisabled();
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it("automatically calculates a saved delivery total and then requires fresh policy agreement", async () => {
    mocks.get.mockResolvedValue({ ...review, taxQuote: null });
    view();
    expect(await screen.findByRole("checkbox")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Calculate tax/ })).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.change).toHaveBeenCalledWith({ kind: "quote" }), { timeout: 2000 });
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeEnabled());
    expect(screen.getByText("$89.90 USD")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeEnabled();
  });
  it("can retry automatic tax after a failed request and an explicit refresh", async () => {
    mocks.get.mockResolvedValue({ ...review, taxQuote: null });
    mocks.change.mockResolvedValueOnce({ status: "unavailable" }).mockResolvedValue(review);
    view();
    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible(), { timeout: 2200 });
    expect(mocks.change).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(mocks.change).toHaveBeenCalledTimes(2), { timeout: 2200 });
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeEnabled());
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeDisabled();
  });
  it("requires a refresh for expired quotes and displays government fees separately in USD", async () => {
    mocks.get.mockResolvedValue({ ...review, taxQuote: { ...review.taxQuote!, totalCents: 9018, fees: [{ state: "CO", amountCents: 28 }], ready: false } });
    view("zh");
    expect(await screen.findByText("$90.18 USD")).toBeInTheDocument();
    expect(screen.getByText("CO 政府配送费")).toBeInTheDocument();
    expect(screen.getByText("$0.28")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认金额并继续付款" })).toBeDisabled();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByText(/正在更新运费与税费预估/)).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "AK" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "HI" })).not.toBeInTheDocument();
  });
  it("disables an expired quote before an automatic refresh can run", async () => {
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
      expect(screen.getByText(/Your shipping and tax estimate is updating/)).toBeInTheDocument();
      expect(mocks.change).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("invalidates old consent and prevents payment after an address or quote mutation fails", async () => {
    view(); fireEvent.click(await screen.findByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeEnabled();
    mocks.change.mockResolvedValueOnce({ status: "unavailable" });
    fireEvent.change(screen.getByLabelText("Recipient name"), { target: { value: "Changed Rider" } });
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

    expect(screen.getByRole("region", { name: "Checkout" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading checkout");
    await act(async () => { resolveCheckout(review); });

    expect(screen.getByRole("region", { name: "Checkout" })).toHaveAttribute("aria-busy", "false");
    expect(mocks.sync).toHaveBeenCalledWith(review.cart);
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

    expect(screen.getByRole("region", { name: "Checkout" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Order summary")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Unsubmitted address")).not.toBeInTheDocument();
    expect(mocks.change).toHaveBeenCalledWith({ kind: "complete" });
    await act(async () => { resolveCompletion({ status: "complete", order: { id: "order_return", number: "1002", total: 89.9 } }); });

    expect(screen.getByText("Order received")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Checkout" })).toHaveAttribute("aria-busy", "false");
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
    fireEvent.submit(screen.getByLabelText("收件人姓名").closest("form")!);
    await waitFor(() => expect(mocks.change).toHaveBeenCalledWith({ kind: "delivery", address: { ...review.address, name: "New Rider" } }));
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
    expect(summary.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(summary);
    const terms = screen.getByRole("region", { name: lang === "en" ? "Full policy terms" : "完整政策条款" });
    expect(terms).toHaveClass("max-h-80", "overflow-y-auto");
    expect(terms).toHaveAttribute("tabindex", "0");
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
    fireEvent.submit(screen.getByLabelText("Recipient name").closest("form")!);
    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
    expect(screen.getByRole("button", { name: "Review & continue to payment" })).toBeDisabled();
    mocks.change.mockResolvedValue(review);
    fireEvent.submit(screen.getByLabelText("Recipient name").closest("form")!);
    await waitFor(() => expect(mocks.change).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("region", { name: "Checkout" })).toHaveAttribute("aria-busy", "false"));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("requires fresh consent after an address save even if the returned amounts are identical", async () => {
    view(); fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.submit(screen.getByLabelText("Recipient name").closest("form")!);
    await waitFor(() => expect(screen.getByRole("region", { name: "Checkout" })).toHaveAttribute("aria-busy", "false"));
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
    expect(screen.getByText("Shipping and tax will update when your details are complete.")).toBeInTheDocument();
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
    expect(await screen.findByText("Order status needs checking")).toBeInTheDocument();
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
    expect(screen.getByRole("region", { name: "Checkout" })).toHaveAttribute("aria-busy", "true");
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
