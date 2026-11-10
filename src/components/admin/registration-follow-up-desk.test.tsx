import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/language";
import type { Registration } from "@/lib/types";
import { defaultRegistrationFinance } from "@/lib/registrations/finance";
import { RegistrationFollowUpDesk } from "./registration-follow-up-desk";

const rows: Registration[] = ["Alice", "Bob"].map((name) => ({
  id: name, contactName: name, contactEmail: "booker@example.com", attendeeEmail: `${name}@example.com`,
  contactPhone: "", eventSlug: "trip", memberId: null, answers: {}, consentGiven: true,
  status: "confirmed", attendanceStatus: "unmarked", attendanceSource: null, attendanceMarkedAt: null,
  createdAt: "2026-11-01", updatedAt: "2026-11-01",
  finance: { ...defaultRegistrationFinance, depositAmount: 50, settlementStatus: name === "Bob" ? "pending_refund" : "not_started" },
}));

function renderDesk(lang: "en" | "zh" = "en", registrations = rows) {
  return render(<LanguageProvider initialLang={lang}><RegistrationFollowUpDesk registrations={registrations} eventTitle={{ en: "Winter ride", zh: "雪山行" }} paymentModel="deposit" pendingCancellationIds={[]} /></LanguageProvider>);
}

describe("RegistrationFollowUpDesk", () => {
  it("opens the highest priority person and filters to deposits with a direct record link", async () => {
    const user = userEvent.setup();
    renderDesk();
    expect(screen.getByLabelText("Message draft")).toHaveProperty("value", expect.stringContaining("Bob"));
    await user.click(screen.getByRole("button", { name: "Deposit follow-up 1" }));
    expect(screen.getByLabelText("Message draft")).toHaveProperty("value", expect.stringContaining("Alice"));
    expect(screen.getByRole("link", { name: "Open attendee record" })).toHaveAttribute("href", "#registration-Alice");
    expect(screen.getByText("booker@example.com")).toBeInTheDocument();
  });

  it("copies edited text and explains clipboard denial without losing the draft", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    renderDesk();
    fireEvent.change(screen.getByLabelText("Message draft"), { target: { value: "My edited message" } });
    await user.click(screen.getByRole("button", { name: "Copy draft" }));
    expect(writeText).toHaveBeenCalledWith("My edited message");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Select the draft and copy it manually."));
    expect(screen.getByLabelText("Message draft")).toHaveValue("My edited message");
    writeText.mockResolvedValue();
    await user.click(screen.getByRole("button", { name: "Copy draft" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Draft copied. Review before sending."));
    writeText.mockRestore();
  });

  it("supports Chinese and a truthful empty state", () => {
    const view = renderDesk("zh");
    expect(screen.getByRole("heading", { name: "报名跟进工作台" })).toBeInTheDocument();
    expect(screen.getByLabelText("消息草稿")).toHaveProperty("value", expect.stringContaining("雪山行"));
    view.unmount();
    renderDesk("en", []);
    expect(screen.getByText("No follow-ups in the current selection.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("links cancellation work to the existing review panel and clears feedback when editing", async () => {
    const user = userEvent.setup();
    render(<LanguageProvider initialLang="en"><RegistrationFollowUpDesk registrations={rows} eventTitle={{ en: "Winter ride", zh: "雪山行" }} paymentModel="deposit" pendingCancellationIds={["Alice"]} /></LanguageProvider>);
    expect(screen.getByRole("link", { name: "Open cancellation review" })).toHaveAttribute("href", "#cancellations");
    await user.click(screen.getByRole("button", { name: "Copy draft" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Draft copied"));
    fireEvent.change(screen.getByLabelText("Message draft"), { target: { value: "" } });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Copy draft" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Deposit follow-up 0" }));
    expect(screen.getByText("No follow-ups in the current selection.")).toBeInTheDocument();
  });
});
