import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/lib/language";
const respond = vi.hoisted(() => vi.fn());
vi.mock("@/lib/registrations/guest-actions", () => ({ respondGuestInvitationAction: respond }));
import { GuestInvitationForm } from "./guest-invitation-form";

it("keeps an accepted invitation awaiting approval from displaying a usable ticket QR", () => {
  render(<LanguageProvider initialLang="en"><GuestInvitationForm token={"a".repeat(64)} attendeeName="Friend" eventSlug="ride" waiverText={null} confirmationStatus="accepted" approvalStatus="pending" qrDataUrl="data:image/png;base64,YQ==" /></LanguageProvider>);
  expect(screen.getByText(/Awaiting staff approval/)).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

beforeEach(() => { vi.clearAllMocks(); respond.mockResolvedValue({ success: true }); });
function show(lang: "en" | "zh" = "en") { render(<LanguageProvider initialLang={lang}><GuestInvitationForm token={"a".repeat(64)} attendeeName="Friend" eventSlug="ride" waiverText="Event Terms" /></LanguageProvider>); }
describe("personal guest acceptance", () => {
  it("renders a consumed invitation as a personal ticket, with no second signature form", () => {
    render(<LanguageProvider initialLang="en"><GuestInvitationForm token={"a".repeat(64)} attendeeName="Friend" eventSlug="ride" waiverText="Terms"
      registrationId="ticket" confirmationStatus="accepted" qrDataUrl="data:image/png;base64,AA==" /></LanguageProvider>);
    expect(screen.getByRole("img",{ name: "Your personal event ticket" })).toBeInTheDocument();
    expect(screen.queryByRole("button",{ name: "Accept and sign" })).not.toBeInTheDocument();
    expect(screen.getByText(/^Ticket:/,{ selector: "p" })).toBeInTheDocument();
  });
  it("submits the attendee’s own signature and attestation", async () => {
    show(); const user = userEvent.setup();
    await user.type(screen.getByLabelText(/full legal name/), "Friend Legal Name");
    await user.click(screen.getByRole("checkbox")); await user.click(screen.getByRole("button", { name: "Accept and sign" }));
    expect(await screen.findByRole("status")).toHaveTextContent("personal acceptance");
    const form = respond.mock.calls[0][0] as FormData;
    expect(form.get("typedName")).toBe("Friend Legal Name"); expect(form.get("attested")).toBe("on"); expect(form.get("decision")).toBe("accept");
  });
  it("allows declining without a signature and explains refund handling", async () => {
    show(); await userEvent.setup().click(screen.getByRole("button", { name: "Decline invitation" }));
    expect(await screen.findByRole("status")).toHaveTextContent("refund terms");
    expect((respond.mock.calls[0][0] as FormData).get("decision")).toBe("decline");
  });
  it("shows a recoverable error for expired or replayed submissions", async () => {
    respond.mockResolvedValue({ success: false }); show("zh");
    await userEvent.setup().click(screen.getByRole("button", { name: "接受并签署" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("邀请也可能已过期");
    expect(screen.getByRole("button", { name: "接受并签署" })).toBeEnabled();
  });
});
