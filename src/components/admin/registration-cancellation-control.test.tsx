import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RegistrationCancellationControl } from "./registration-cancellation-control";

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<object>("react-dom");
  return {
    ...actual,
    useFormStatus: () => ({ pending: false }),
  };
});

describe("RegistrationCancellationControl", () => {
  it("requires typing CANCEL before the destructive action can be submitted", async () => {
    const user = userEvent.setup();
    render(
      <RegistrationCancellationControl
        action={"#" as never}
        registrationId="reg-123"
        returnEvent="event-123"
      />,
    );

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Cancel" }));
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/does not issue a refund/i)).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Cancel registration" });
    expect(submit).toBeDisabled();

    await act(async () => {
      await user.type(screen.getByLabelText("Confirmation"), "CANCEL");
    });

    expect(submit).toBeEnabled();
    const form = screen.getByLabelText("Confirmation").closest("form");
    if (!form) throw new Error("Expected cancellation form");
    expect(new FormData(form).get("confirmation")).toBe("CANCEL");
  });

  it("hides cancellation when a paid registration requires admin approval", () => {
    render(<RegistrationCancellationControl action={"#" as never} registrationId="reg-123" returnEvent="event-123" canCancel={false} />);
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.getByText(/Admin approval required/)).toBeInTheDocument();
  });
});
