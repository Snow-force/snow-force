import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { ShopClientTiming } from "@/lib/shop/performance-browser";
const mocks = vi.hoisted(() => ({ confirm: vi.fn(), submit: vi.fn(), load: vi.fn(), validate: vi.fn(), complete: vi.fn(), busy: vi.fn(), sdkAvailable: true }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: ReactNode }) => <>{children}</>,
  PaymentElement: ({ onReady, onLoadError }: { onReady: () => void; onLoadError: () => void }) => <div><p>Stripe payment details</p><button type="button" onClick={onReady}>Fixture payment ready</button><button type="button" onClick={onLoadError}>Fixture payment load error</button></div>,
  useStripe: () => mocks.sdkAvailable ? ({ confirmPayment: mocks.confirm }) : null, useElements: () => mocks.sdkAvailable ? ({ submit: mocks.submit }) : null,
}));
vi.mock("@stripe/stripe-js/pure", () => ({ loadStripe: mocks.load }));
import StripeCheckoutForm from "./stripe-checkout-form";
import { LanguageProvider, useLanguage } from "@/lib/language";
import { loadCheckoutStripe } from "@/lib/shop/stripe-loader";
beforeEach(() => { vi.resetAllMocks(); mocks.sdkAvailable = true; mocks.load.mockResolvedValue({}); mocks.submit.mockResolvedValue({}); mocks.validate.mockResolvedValue(true); mocks.complete.mockResolvedValue(undefined); mocks.confirm.mockResolvedValue({ paymentIntent: { status: "requires_capture" } }); });
afterEach(() => vi.useRealTimers());
function view(ready = true, timing?: ShopClientTiming) {
  const rendered = render(<LanguageProvider initialLang="en"><StripeCheckoutForm timing={timing} clientSecret="pi_fixture_secret_fixture" publishableKey="pk_test_fixture" total={89.9} validate={mocks.validate} complete={mocks.complete} onBusyChange={mocks.busy} /></LanguageProvider>);
  if (ready) fireEvent.click(screen.getByRole("button", { name: "Fixture payment ready" }));
  return rendered;
}
it("reuses the prewarmed SDK through confirmation uncertainty and language changes", async () => {
  await loadCheckoutStripe("pk_test_prewarmed"); mocks.confirm.mockRejectedValue(Error("response lost"));
  render(<LanguageProvider initialLang="en"><LanguageSwitch /><StripeCheckoutForm prewarm clientSecret="pi_fixture_secret_fixture" publishableKey="pk_test_prewarmed" total={89.9} validate={mocks.validate} complete={mocks.complete} /></LanguageProvider>);
  fireEvent.click(screen.getByRole("button",{name:"Fixture payment ready"})); fireEvent.click(screen.getByRole("button",{name:"Authorize $89.90"}));
  await screen.findByRole("alert"); fireEvent.click(screen.getByRole("button",{name:"Chinese"}));
  expect(mocks.load).toHaveBeenCalledExactlyOnceWith("pk_test_prewarmed"); expect(mocks.confirm).toHaveBeenCalledOnce(); expect(screen.getByRole("button",{name:"授权付款 $89.90"})).toBeDisabled();
});
it("records interactivity only after onReady and usable SDK/Elements, without reinitializing on rerender", async () => {
  const report = vi.fn(), timing: ShopClientTiming = { operationId: "11111111-1111-4111-8111-000000000001", report, measure: async (_phase, work) => work() };
  mocks.sdkAvailable = false; const rendered = view(false, timing);
  fireEvent.click(screen.getByRole("button", { name: "Fixture payment ready" }));
  expect(report).toHaveBeenCalledWith("payment.element_ready"); expect(report).not.toHaveBeenCalledWith("payment.interactive");
  expect(screen.getByRole("button", { name: "Authorize $89.90" })).toBeDisabled();
  mocks.sdkAvailable = true;
  rendered.rerender(<LanguageProvider initialLang="en"><StripeCheckoutForm timing={timing} clientSecret="pi_fixture_secret_fixture" publishableKey="pk_test_fixture" total={89.9} validate={mocks.validate} complete={mocks.complete} onBusyChange={mocks.busy} /></LanguageProvider>);
  await waitFor(() => expect(report).toHaveBeenCalledWith("payment.interactive")); expect(mocks.load).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Fixture payment ready" }));
  expect(report.mock.calls.filter(call => call[0] === "payment.element_ready")).toHaveLength(1);
});
it("records authorization separately from order callback completion without provider secrets", async () => {
  const report = vi.fn(), timing: ShopClientTiming = { operationId: "11111111-1111-4111-8111-000000000001", report, measure: async (_phase, work) => work() };
  view(true, timing); fireEvent.click(screen.getByRole("button", { name: "Authorize $89.90" }));
  await waitFor(() => expect(report).toHaveBeenCalledWith("payment.order", "returned", expect.any(Number)));
  expect(report).toHaveBeenCalledWith("payment.confirm", "authorized", expect.any(Number));
  expect(JSON.stringify(report.mock.calls)).not.toMatch(/pi_fixture|secret|89\.9/); expect(mocks.confirm).toHaveBeenCalledOnce();
});
it("counts SDK rejection as a failed readiness attempt rather than omitting it from the denominator", async () => {
  const report = vi.fn(), timing: ShopClientTiming = { operationId: "11111111-1111-4111-8111-000000000001", report, measure: async (_phase, work) => work() };
  mocks.sdkAvailable = false; mocks.load.mockRejectedValue(Error("private SDK failure")); view(false, timing);
  await screen.findByRole("alert"); expect(report).toHaveBeenCalledWith("payment.interactive", "error"); expect(report).not.toHaveBeenCalledWith("payment.interactive"); expect(JSON.stringify(report.mock.calls)).not.toContain("private SDK"); expect(mocks.confirm).not.toHaveBeenCalled();
});
it("validates Elements and the current server quote before confirming the same native intent", async () => {
  view(); fireEvent.click(screen.getByRole("button", { name: "Authorize $89.90" }));
  await waitFor(() => expect(mocks.complete).toHaveBeenCalledTimes(1));
  expect(mocks.confirm).toHaveBeenCalledWith({ elements: expect.any(Object), confirmParams: { return_url: `${window.location.origin}/shop/checkout/return` }, redirect: "if_required" });
  expect(mocks.load).toHaveBeenCalledWith("pk_test_fixture");
});
it("does not submit a stale server quote", async () => {
  mocks.validate.mockResolvedValue(false); view(); fireEvent.click(screen.getByRole("button", { name: "Authorize $89.90" }));
  await screen.findByRole("alert"); expect(mocks.confirm).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
});
it("does not complete orders for invalid payment details or a declined confirmation", async () => {
  mocks.confirm.mockResolvedValue({ error: { type: "card_error", message: "Card declined" } }); view(); fireEvent.click(screen.getByRole("button", { name: "Authorize $89.90" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Card declined"); expect(mocks.complete).not.toHaveBeenCalled();
});
it("prevents duplicate confirmations while the first request is pending", async () => {
  let release: ((value: boolean) => void) | undefined;
  mocks.validate.mockImplementation(() => new Promise<boolean>((resolve) => { release = resolve; }));
  view(); const button = screen.getByRole("button", { name: "Authorize $89.90" });
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(mocks.validate).toHaveBeenCalledTimes(1));
  await act(async () => { release?.(true); });
  await waitFor(() => expect(mocks.complete).toHaveBeenCalledTimes(1)); expect(mocks.confirm).toHaveBeenCalledTimes(1);
});
it("asks the server to verify processing payments instead of displaying browser success", async () => {
  mocks.confirm.mockResolvedValue({ paymentIntent: { status: "processing" } }); view(); fireEvent.click(screen.getByRole("button", { name: "Authorize $89.90" }));
  await waitFor(() => expect(mocks.complete).toHaveBeenCalledTimes(1)); expect(screen.queryByText(/Order received/)).not.toBeInTheDocument();
});
it("surfaces Elements validation without contacting the payment provider", async () => {
  mocks.submit.mockResolvedValue({ error: { message: "Payment details are incomplete" } }); view(); fireEvent.click(screen.getByRole("button", { name: "Authorize $89.90" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("incomplete"); expect(mocks.validate).not.toHaveBeenCalled(); expect(mocks.confirm).not.toHaveBeenCalled();
});
it("blocks recovery before Elements submission and until confirmation and completion have settled", async () => {
  let release: (value: { paymentIntent: { status: string } }) => void = () => { throw new Error("Confirmation was not started."); };
  mocks.submit.mockImplementation(async () => { expect(mocks.busy).toHaveBeenLastCalledWith(true); return {}; });
  mocks.confirm.mockReturnValue(new Promise<{ paymentIntent: { status: string } }>((resolve) => { release = resolve; }));
  view(); fireEvent.click(screen.getByRole("button", { name: "Authorize $89.90" }));
  await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
  expect(mocks.busy.mock.calls).toEqual([[true]]);
  expect(screen.getByRole("button", { name: "Confirming…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Confirming…" }).querySelector("[data-loading-spinner]")).not.toBeNull();
  expect(screen.getByText("Confirming payment authorization…")).toHaveAttribute("role", "status");
  await act(async () => { release({ paymentIntent: { status: "requires_capture" } }); });
  expect(mocks.complete).toHaveBeenCalledOnce();
  expect(mocks.busy.mock.calls).toEqual([[true], [false]]);
});
it.each(["details", "declined", "transport"] as const)("re-enables payment-state checking after a %s failure", async (failure) => {
  if (failure === "details") mocks.submit.mockResolvedValue({ error: { message: "Missing card details" } });
  if (failure === "declined") mocks.confirm.mockResolvedValue({ error: { message: "Payment canceled or declined" } });
  if (failure === "transport") mocks.confirm.mockRejectedValue(new Error("Provider unavailable"));
  view(); fireEvent.click(screen.getByRole("button", { name: "Authorize $89.90" }));
  await screen.findByRole("alert");
  expect(mocks.busy.mock.calls).toEqual([[true], [false]]);
  expect(mocks.complete).not.toHaveBeenCalled();
  expect(screen.queryByText("Confirming payment authorization…")).not.toBeInTheDocument();
});
it("shows a spinner and forbids submission until the PaymentElement is ready", async () => {
  const { container } = view(false);
  const button = screen.getByRole("button", { name: "Authorize $89.90" });
  expect(button).toBeDisabled();
  expect(screen.getByText("Loading secure payment…")).toHaveAttribute("role", "status");
  expect(container.querySelector("[data-loading-spinner]")).not.toBeNull();
  fireEvent.click(button);
  expect(mocks.submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Fixture payment ready" }));
  expect(button).toBeEnabled();
  await waitFor(() => expect(screen.queryByText("Loading secure payment…")).not.toBeInTheDocument());
});
it("announces a slow loader, then recovers after a timeout without authorizing payment", async () => {
  vi.useFakeTimers(); view(false);
  await act(async () => { await Promise.resolve(); vi.advanceTimersByTime(8_000); });
  expect(screen.getByText(/taking longer than usual/)).toBeVisible();
  act(() => vi.advanceTimersByTime(22_000));
  expect(screen.getByRole("alert")).toHaveTextContent("taking too long to load");
  expect(screen.queryByText("Loading secure payment…")).not.toBeInTheDocument();
  expect(mocks.submit).not.toHaveBeenCalled(); expect(mocks.confirm).not.toHaveBeenCalled();
  // A late ready event from the timed-out instance cannot bypass explicit retry.
  fireEvent.click(screen.getByRole("button", { name: "Fixture payment ready" }));
  expect(screen.getByRole("button", { name: "Authorize $89.90" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Reload secure payment form" }));
  expect(mocks.load).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Fixture payment ready" }));
  expect(screen.getByRole("button", { name: "Authorize $89.90" })).toBeEnabled();
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it("replaces a failed element loader with an actionable error, not an infinite spinner", async () => {
  const { container } = view(false);
  fireEvent.click(screen.getByRole("button", { name: "Fixture payment load error" }));
  expect(screen.getByRole("alert")).toHaveTextContent("form could not load");
  expect(container.querySelector("[data-loading-spinner]")).toBeNull();
  expect(screen.getByRole("button", { name: "Authorize $89.90" })).toBeDisabled();
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it.each(["null", "rejected"] as const)("handles a %s SDK load without authorizing payment", async failure => {
  if (failure === "null") mocks.load.mockResolvedValue(null);
  else mocks.load.mockRejectedValue(new Error("Network failure"));
  const { container } = view(false);
  expect(await screen.findByRole("alert")).toHaveTextContent("secure payment service could not load");
  expect(container.querySelector("[data-loading-spinner]")).toBeNull();
  expect(mocks.confirm).not.toHaveBeenCalled();
});

it("retries a failed SDK load with the same payment and waits for fresh form readiness", async () => {
  mocks.load.mockRejectedValueOnce(new Error("Offline")).mockResolvedValue({});
  view(false);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Reload secure payment form" }));
  expect(mocks.load).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "Authorize $89.90" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Fixture payment ready" }));
  expect(screen.getByRole("button", { name: "Authorize $89.90" })).toBeEnabled();
  expect(mocks.validate).not.toHaveBeenCalled(); expect(mocks.confirm).not.toHaveBeenCalled();
});

it("reloads an element failure without submitting or preparing another payment", () => {
  view(false);
  fireEvent.click(screen.getByRole("button", { name: "Fixture payment load error" }));
  fireEvent.click(screen.getByRole("button", { name: "Reload secure payment form" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Authorize $89.90" })).toBeDisabled();
  expect(mocks.load).toHaveBeenCalledTimes(2);
  expect(mocks.submit).not.toHaveBeenCalled(); expect(mocks.confirm).not.toHaveBeenCalled();
});

it.each(["transport", "provider"] as const)("blocks repeated authorization after an uncertain %s result", async failure => {
  if (failure === "transport") mocks.confirm.mockRejectedValue(new Error("Timeout with private provider data"));
  else mocks.confirm.mockResolvedValue({ error: { type: "api_connection_error", message: "Private provider data" } });
  view(); fireEvent.click(screen.getByRole("button", { name: "Authorize $89.90" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Use Check payment status");
  const button = screen.getByRole("button", { name: "Authorize $89.90" });
  expect(button).toBeDisabled(); fireEvent.click(button);
  expect(mocks.confirm).toHaveBeenCalledOnce();
  expect(screen.getByRole("link", { name: "Check orders in a new tab" })).toHaveAttribute("href", "/member/orders");
  expect(mocks.busy).toHaveBeenLastCalledWith(false);
  expect(screen.queryByText(/Private provider data/)).not.toBeInTheDocument();
});

it("permits corrected details after a definite card decline", async () => {
  mocks.confirm.mockResolvedValue({ error: { type: "card_error", message: "Card declined" } });
  view(); fireEvent.click(screen.getByRole("button", { name: "Authorize $89.90" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Card declined");
  expect(screen.getByRole("button", { name: "Authorize $89.90" })).toBeEnabled();
  expect(mocks.complete).not.toHaveBeenCalled();
});

it("permits retry if the quote check fails before confirmation is attempted", async () => {
  mocks.validate.mockRejectedValue(new Error("Offline"));
  view(); fireEvent.click(screen.getByRole("button", { name: "Authorize $89.90" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Check your connection and try again");
  expect(screen.getByRole("button", { name: "Authorize $89.90" })).toBeEnabled();
  expect(mocks.confirm).not.toHaveBeenCalled();
});

it.each(["succeeded", "requires_capture", "processing"])("never authorizes again after %s even when order verification has not replaced the form", async status => {
  mocks.confirm.mockResolvedValue({ paymentIntent: { status } });
  view(); fireEvent.click(screen.getByRole("button", { name: "Authorize $89.90" }));
  await waitFor(() => expect(mocks.complete).toHaveBeenCalledOnce());
  expect(screen.getByRole("button", { name: "Authorize $89.90" })).toBeDisabled();
  expect(mocks.confirm).toHaveBeenCalledOnce();
  expect(screen.getByRole("link", { name: "Check orders in a new tab" })).toBeVisible();
});

it.each(["requires_action", "requires_confirmation", "requires_payment_method"])("shows instructions for %s without claiming the order is complete", async status => {
  mocks.confirm.mockResolvedValue({ paymentIntent: { status } });
  view(); fireEvent.click(screen.getByRole("button", { name: "Authorize $89.90" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Payment still needs confirmation");
  expect(mocks.complete).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Authorize $89.90" })).toBeEnabled();
});

it.each(["missing", "canceled"])("requires a server check for a %s confirmation result", async status => {
  mocks.confirm.mockResolvedValue(status === "missing" ? {} : { paymentIntent: { status } });
  view(); fireEvent.click(screen.getByRole("button", { name: "Authorize $89.90" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Use Check payment status");
  expect(screen.getByRole("button", { name: "Authorize $89.90" })).toBeDisabled();
  expect(mocks.complete).not.toHaveBeenCalled();
});

it("requires status checking after authorization when order verification rejects", async () => {
  mocks.complete.mockRejectedValue(new Error("Lost order verification response"));
  view(); fireEvent.click(screen.getByRole("button", { name: "Authorize $89.90" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Use Check payment status");
  expect(screen.getByRole("button", { name: "Authorize $89.90" })).toBeDisabled();
  expect(mocks.confirm).toHaveBeenCalledOnce();
});

function LanguageSwitch() {
  const { setLang } = useLanguage();
  return <button onClick={() => setLang("zh")}>Chinese</button>;
}

it("preserves an uncertain payment across a language switch", async () => {
  mocks.confirm.mockRejectedValue(new Error("Lost response"));
  render(<LanguageProvider initialLang="en"><LanguageSwitch /><StripeCheckoutForm clientSecret="pi_fixture_secret_fixture" publishableKey="pk_test_fixture" total={89.9} validate={mocks.validate} complete={mocks.complete} /></LanguageProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Fixture payment ready" }));
  fireEvent.click(screen.getByRole("button", { name: "Authorize $89.90" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Chinese" }));
  expect(screen.getByRole("alert")).toHaveTextContent("付款结果尚未确认");
  expect(screen.getByRole("button", { name: /授权付款/ })).toBeDisabled();
  expect(mocks.confirm).toHaveBeenCalledOnce();
  expect(mocks.load).toHaveBeenCalledOnce();
});
