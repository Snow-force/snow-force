import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

function renderControl(finance: RegistrationFinance) {
  return render(
    <table>
      <tbody>
        <tr>
          <RegistrationFinanceControl
            action={vi.fn()}
            createdAt="2026-06-30T00:00:00.000Z"
            finance={finance}
            isSaved={false}
            registrationId="reg-123"
            returnEvent="event-123"
          />
        </tr>
      </tbody>
    </table>
  );
}

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
    expect(screen.getByText(/paid online via stripe/i)).toBeInTheDocument();
  });

  it("keeps depositStatus enabled for refunded Stripe payments", () => {
    const finance: RegistrationFinance = {
      ...defaultRegistrationFinance,
      paymentMethod: "stripe",
      depositStatus: "refunded",
    };
    renderControl(finance);

    const select = screen.getByLabelText("Deposit status") as HTMLSelectElement;
    expect(select).not.toBeDisabled();
    expect(screen.queryByText(/paid online via stripe/i)).toBeNull();
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
    expect(screen.queryByText(/paid online via stripe/i)).toBeNull();
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
});
