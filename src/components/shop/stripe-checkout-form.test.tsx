import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const mocks = vi.hoisted(() => ({ confirm: vi.fn(), submit: vi.fn(), load: vi.fn(), validate: vi.fn(), complete: vi.fn(), busy: vi.fn() }));
vi.mock("@stripe/react-stripe-js", () => ({ Elements: ({ children }: { children: ReactNode }) => <>{children}</>, PaymentElement: () => <p>Stripe payment details</p>, useStripe: () => ({ confirmPayment: mocks.confirm }), useElements: () => ({ submit: mocks.submit }) }));
vi.mock("@stripe/stripe-js/pure", () => ({ loadStripe: mocks.load }));
import StripeCheckoutForm from "./stripe-checkout-form";
import { LanguageProvider } from "@/lib/language";
beforeEach(() => { vi.resetAllMocks(); mocks.load.mockResolvedValue(null); mocks.submit.mockResolvedValue({}); mocks.validate.mockResolvedValue(true); mocks.complete.mockResolvedValue(undefined); mocks.confirm.mockResolvedValue({ paymentIntent: { status: "requires_capture" } }); });
const view = () => render(<LanguageProvider initialLang="en"><StripeCheckoutForm clientSecret="pi_fixture_secret_fixture" publishableKey="pk_test_fixture" total={89.9} validate={mocks.validate} complete={mocks.complete} onBusyChange={mocks.busy} /></LanguageProvider>);
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
  mocks.confirm.mockResolvedValue({ error: { message: "Card declined" } }); view(); fireEvent.click(screen.getByRole("button", { name: "Authorize $89.90" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Card declined"); expect(mocks.complete).not.toHaveBeenCalled();
});
it("prevents duplicate confirmations while the first request is pending", async () => {
  let release: ((value: boolean) => void) | undefined;
  mocks.validate.mockImplementation(() => new Promise<boolean>((resolve) => { release = resolve; }));
  view(); const button = screen.getByRole("button", { name: "Authorize $89.90" });
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(mocks.validate).toHaveBeenCalledTimes(1));
  release?.(true);
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
});
