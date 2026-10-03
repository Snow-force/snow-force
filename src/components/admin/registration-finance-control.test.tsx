import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegistrationFinanceControl } from "./registration-finance-control";
import { defaultRegistrationFinance } from "@/lib/registrations/finance";
import type { RegistrationFinance } from "@/lib/types";

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<object>("react-dom");
  return {
    ...actual,
    useFormStatus: () => ({ pending: false }),
  };
});

type ControlOptions = {
  isSaved?: boolean;
  registrationId?: string;
  returnEvent?: string;
  createdAt?: string;
};

const financeAction = async () => undefined;

function control(finance: RegistrationFinance, options: ControlOptions = {}) {
  return (
    <table>
      <tbody>
        <tr>
          <RegistrationFinanceControl
            action={financeAction}
            createdAt={options.createdAt ?? "2026-06-30T00:00:00.000Z"}
            finance={finance}
            isSaved={options.isSaved ?? false}
            registrationId={options.registrationId ?? "reg-123"}
            returnEvent={options.returnEvent ?? "event-123"}
          />
        </tr>
      </tbody>
    </table>
  );
}

function renderControl(finance: RegistrationFinance, options?: ControlOptions) {
  return render(control(finance, options));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("RegistrationFinanceControl", () => {
  it("disables depositStatus and shows caption when Stripe paid", () => {
    const finance: RegistrationFinance = {
      ...defaultRegistrationFinance,
      paymentMethod: "stripe",
      depositStatus: "paid",
    };
    renderControl(finance);

    const select = screen.getByLabelText("Deposit status") as HTMLSelectElement;
    expect(select).toBeDisabled();
    expect(screen.getByText(/stripe-managed payment/i)).toBeInTheDocument();
  });

  it("keeps refunded Stripe payment fields managed by the refund workflow", () => {
    const finance: RegistrationFinance = {
      ...defaultRegistrationFinance,
      paymentMethod: "stripe",
      depositStatus: "refunded",
    };
    renderControl(finance);

    const select = screen.getByLabelText("Deposit status") as HTMLSelectElement;
    expect(select).toBeDisabled();
    expect(screen.getByText(/stripe-managed payment/i)).toBeInTheDocument();
  });

  it("keeps depositStatus enabled for non-Stripe pending payments", () => {
    const finance: RegistrationFinance = {
      ...defaultRegistrationFinance,
      paymentMethod: "",
      depositStatus: "pending",
    };
    renderControl(finance);

    const select = screen.getByLabelText("Deposit status") as HTMLSelectElement;
    expect(select).not.toBeDisabled();
    expect(screen.queryByText(/stripe-managed payment/i)).toBeNull();
  });

  it("makes depositAmount readOnly when Stripe paid", () => {
    const finance: RegistrationFinance = {
      ...defaultRegistrationFinance,
      paymentMethod: "stripe",
      depositStatus: "paid",
    };
    renderControl(finance);

    const input = screen.getByLabelText("Deposit amount") as HTMLInputElement;
    expect(input).toHaveAttribute("readonly");
  });

  it("preserves unsaved fields when unrelated registration data is refreshed", async () => {
    const user = userEvent.setup();
    const finance = { ...defaultRegistrationFinance, depositAmount: 50 };
    const { rerender, container } = renderControl(finance);

    await user.clear(screen.getByLabelText("Deposit amount"));
    await user.type(screen.getByLabelText("Deposit amount"), "75");
    await user.selectOptions(screen.getByLabelText("Deposit status"), "paid");
    await user.selectOptions(screen.getByLabelText("Settlement status"), "settled");
    rerender(control({ ...finance, paymentNote: "Reviewed", paymentMethod: "cash", finalAmount: 90 }, {
      createdAt: "2026-07-01T00:00:00.000Z",
      returnEvent: "event-456",
    }));

    expect(screen.getByLabelText("Deposit amount")).toHaveValue("75");
    expect(screen.getByLabelText("Deposit status")).toHaveValue("paid");
    expect(screen.getByLabelText("Settlement status")).toHaveValue("settled");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(container.querySelector('input[name="returnEvent"]')).toHaveValue("event-456");
  });

  it.each([
    ["deposit amount", { depositAmount: 80 }],
    ["deposit status", { depositStatus: "waived" }],
    ["settlement status", { settlementStatus: "pending_balance" }],
  ] as const)("resets all drafts when the authoritative %s changes", (_field, update) => {
    const finance = { ...defaultRegistrationFinance, depositAmount: 50 };
    const { rerender } = renderControl(finance);
    fireEvent.change(screen.getByLabelText("Deposit amount"), { target: { value: "75" } });
    fireEvent.change(screen.getByLabelText("Deposit status"), { target: { value: "paid" } });
    fireEvent.change(screen.getByLabelText("Settlement status"), { target: { value: "settled" } });

    const updatedFinance = { ...finance, ...update };
    rerender(control(updatedFinance));

    expect(screen.getByLabelText("Deposit amount")).toHaveValue(String(updatedFinance.depositAmount));
    expect(screen.getByLabelText("Deposit status")).toHaveValue(updatedFinance.depositStatus);
    expect(screen.getByLabelText("Settlement status")).toHaveValue(updatedFinance.settlementStatus);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("does not carry drafts into a different registration with identical finance values", () => {
    const finance = { ...defaultRegistrationFinance, depositAmount: 50 };
    const { rerender, container } = renderControl(finance);
    fireEvent.change(screen.getByLabelText("Deposit amount"), { target: { value: "75" } });

    rerender(control(finance, { registrationId: "reg-456" }));

    expect(screen.getByLabelText("Deposit amount")).toHaveValue("50");
    expect(screen.getByLabelText("Deposit amount")).toHaveAttribute("form", "finance-reg-456");
    expect(container.querySelector('input[name="id"]')).toHaveValue("reg-456");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("restores authoritative fields when a manual payment becomes Stripe-managed", () => {
    const finance = { ...defaultRegistrationFinance, depositAmount: 50 };
    const { rerender } = renderControl(finance);
    fireEvent.change(screen.getByLabelText("Deposit amount"), { target: { value: "75" } });
    fireEvent.change(screen.getByLabelText("Deposit status"), { target: { value: "paid" } });

    rerender(control({ ...finance, paymentMethod: "stripe" }));

    expect(screen.getByLabelText("Deposit amount")).toHaveValue("50");
    expect(screen.getByLabelText("Deposit amount")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Deposit status")).toHaveValue("pending");
    expect(screen.getByLabelText("Deposit status")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("expires the saved notice without restarting it on finance refresh, and reopens after another save", () => {
    vi.useFakeTimers();
    const finance = { ...defaultRegistrationFinance, depositAmount: 50 };
    const { rerender } = renderControl(finance, { isSaved: true });
    expect(screen.getByText("Finance updated")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2000));

    const updatedFinance = { ...finance, depositAmount: 60 };
    rerender(control(updatedFinance, { isSaved: true }));
    act(() => vi.advanceTimersByTime(400));
    expect(screen.queryByText("Finance updated")).toBeNull();

    rerender(control({ ...updatedFinance, depositAmount: 70 }, { isSaved: true }));
    expect(screen.queryByText("Finance updated")).toBeNull();
    rerender(control(updatedFinance, { isSaved: false }));
    rerender(control(updatedFinance, { isSaved: true }));
    expect(screen.getByText("Finance updated")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2400));
    expect(screen.queryByText("Finance updated")).toBeNull();
  });

  it("keeps drafts when the saved flag changes and cancels the old notice timer", () => {
    vi.useFakeTimers();
    const finance = { ...defaultRegistrationFinance, depositAmount: 50 };
    const { rerender, unmount } = renderControl(finance);
    fireEvent.change(screen.getByLabelText("Deposit amount"), { target: { value: "75" } });

    rerender(control(finance, { isSaved: true }));
    expect(screen.getByLabelText("Deposit amount")).toHaveValue("75");
    expect(screen.getByText("Finance updated")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    rerender(control(finance, { isSaved: false }));
    expect(screen.queryByText("Finance updated")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    rerender(control(finance, { isSaved: true }));
    act(() => vi.advanceTimersByTime(1400));
    expect(screen.getByText("Finance updated")).toBeInTheDocument();
    expect(screen.getByLabelText("Deposit amount")).toHaveValue("75");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
