import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/lib/language";
const mocks = vi.hoisted(() => ({ invitation: vi.fn(),qr: vi.fn() }));
vi.mock("@/lib/registrations/guest-invitations", () => ({ getGuestInvitation: mocks.invitation }));
vi.mock("@/lib/events/share-payload", () => ({ buildQrCodeDataUrl: mocks.qr }));
vi.mock("@/lib/registrations/guest-actions", () => ({ respondGuestInvitationAction: vi.fn() }));
import GuestInvitationPage, { metadata } from "./page";
beforeEach(() => { vi.clearAllMocks(); mocks.qr.mockResolvedValue({ dataUrl: "data:image/png;base64,AA==" }); });
describe("private personal ticket page", () => {
  it("does not index bearer links or expose unavailable attendees", async () => {
    mocks.invitation.mockResolvedValue(null);
    render(await GuestInvitationPage({ params: Promise.resolve({ token: "invalid" }) }));
    expect(screen.getByText(/Invitation unavailable/)).toBeInTheDocument(); expect(mocks.qr).not.toHaveBeenCalled();
    expect(metadata).toMatchObject({ robots: { index: false,follow: false },referrer: "no-referrer" });
  });
  it("generates a server-side personal QR and returns only the consumed ticket", async () => {
    mocks.invitation.mockResolvedValue({ attendeeName: "Friend",eventSlug: "ride",registrationId: "ticket",confirmationStatus: "accepted",attendanceStatus: "unmarked",waiverText: null });
    render(<LanguageProvider initialLang="en">{await GuestInvitationPage({ params: Promise.resolve({ token: "personal-token" }) })}</LanguageProvider>);
    expect(mocks.qr).toHaveBeenCalledWith(expect.stringContaining("/events/guest/personal-token"));
    expect(screen.getByRole("img",{ name: "Your personal event ticket" })).toBeInTheDocument();
  });
});
