import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { defaultRegistrationFinance } from "@/lib/registrations/finance";
import { RegistrationRefundControl } from "./registration-refund-control";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function renderControl(canRefund: boolean) {
  return render(
    <RegistrationRefundControl
      canRefund={canRefund}
      finance={{
        ...defaultRegistrationFinance,
        depositAmount: 100,
        depositStatus: "paid",
        paymentMethod: "stripe",
        paymentCurrency: "usd",
        stripeCheckoutSessionId: "cs_test_1",
        stripePaymentIntentId: "pi_test_1",
      }}
      linkAction={vi.fn()}
      refunds={[]}
      refundAction={vi.fn()}
      registrationId="reg-1"
      verifyAction={vi.fn()}
    />,
  );
}

describe("RegistrationRefundControl", () => {
  it("keeps refund operations read-only for managers", () => {
    renderControl(false);

    expect(screen.queryByRole("button", { name: "Refund & cancel" })).not.toBeInTheDocument();
    expect(screen.getByText("Admin required for refunds")).toBeInTheDocument();
  });

  it("warns that every refund cancels and requires REFUND plus an internal note", async () => {
    const user = userEvent.setup();
    renderControl(true);

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Refund & cancel" }));
    });

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("cancel the registration");
    const submit = within(dialog).getByRole("button", { name: "Refund & cancel" });
    expect(submit).toBeDisabled();

    await act(async () => {
      await user.type(screen.getByLabelText("Internal note"), "Customer requested a refund.");
      await user.type(screen.getByLabelText("Type REFUND to confirm"), "REFUND");
    });

    expect(submit).toBeEnabled();
  });
});
