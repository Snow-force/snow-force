import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/language";
import type { CancellationCase } from "@/lib/registrations/cancellation-types";
const m = vi.hoisted(() => ({
  request: vi.fn(),
  withdraw: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: m.refresh }),
}));
vi.mock("@/lib/registrations/cancellation-actions", () => ({
  requestCancellationAction: m.request,
  withdrawCancellationAction: m.withdraw,
}));
import { CancellationPanel } from "./cancellation-panel";
const item: CancellationCase = {
  registrationId: "ticket",
  name: "Friend",
  eventSlug: "mammoth",
  registrationStatus: "confirmed",
  paidAmount: 99,
  refundedAmount: 0,
  currency: "usd",
  canRequest: true,
  request: null,
  refundStatus: "none",
  externalRefund: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  document.cookie = "lang=en;path=/";
});
it("requires reason and explicit confirmation before creating a request", async () => {
  m.request.mockResolvedValue({ success: true });
  render(
    <LanguageProvider>
      <CancellationPanel cases={[item]} />
    </LanguageProvider>,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Request cancellation" }),
  );
  expect(m.request).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toHaveTextContent("does not cancel");
  await userEvent.type(
    screen.getByRole("textbox", { name: "Reason" }),
    "Cannot attend",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Submit for approval" }),
  );
  await waitFor(() => expect(m.request).toHaveBeenCalledOnce());
  expect(m.request.mock.calls[0][0].get("registrationId")).toBe("ticket");
  expect(m.request.mock.calls[0][0].get("confirmation")).toBe("REQUEST");
});
it("shows pending review separately from the active place and offers withdrawal", async () => {
  render(
    <LanguageProvider>
      <CancellationPanel
        cases={[
          {
            ...item,
            request: {
              id: "request",
              registration_id: "ticket",
              requested_by: "booker",
              reason: "Cannot attend",
              status: "pending",
              decision_note: "",
              reviewed_by: null,
              reviewed_at: null,
              refund_amount: 0,
              refund_operation_id: null,
              created_at: "2026-11-03",
              updated_at: "2026-11-03",
            },
          },
        ]}
      />
    </LanguageProvider>,
  );
  expect(screen.getByText(/Registration: Confirmed/)).toBeInTheDocument();
  expect(
    screen.getByText("Cancel requested — awaiting approval"),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Withdraw request" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Request cancellation" }),
  ).not.toBeInTheDocument();
});
