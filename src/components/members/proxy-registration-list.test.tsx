import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/lib/language";
import type { Registration } from "@/lib/types";
const issue = vi.hoisted(() => vi.fn());
vi.mock("@/lib/registrations/guest-actions", () => ({ createGuestInvitationAction: issue }));
import { ProxyRegistrationList } from "./proxy-registration-list";
const ticket: Registration = { id: "friend-ticket",eventSlug: "ride",memberId: null,bookerMemberId: "booker",registrationKind: "proxy",
  attendeeConfirmationStatus: "pending",answers: {},consentGiven: true,contactName: "Friend One",contactEmail: "payer@example.test",contactPhone: "",
  status: "confirmed",attendanceStatus: "unmarked",attendanceSource: null,attendanceMarkedAt: null,createdAt: "2026-10-22",updatedAt: "2026-10-22" };
beforeEach(() => { vi.clearAllMocks(); issue.mockResolvedValue({ success: true,url: "/events/guest/personal-token" }); });
describe("booker friend management", () => {
  it("shows approval and rejection independently of payment", () => {
    render(<LanguageProvider initialLang="en"><ProxyRegistrationList registrations={[{ ...ticket,approvalStatus: "pending" },{ ...ticket,id: "rejected",approvalStatus: "rejected",status: "cancelled" }]} /></LanguageProvider>);
    expect(screen.getByText(/Awaiting staff approval/)).toBeInTheDocument();
    expect(screen.getByText(/Not approved/)).toBeInTheDocument();
  });
  it("shows the friend’s status and privately generated link without listing self tickets", async () => {
    render(<LanguageProvider initialLang="en"><ProxyRegistrationList registrations={[ticket,{ ...ticket,id: "self",registrationKind: "self",contactName: "Self" }]} /></LanguageProvider>);
    expect(screen.getByText(/Friend One/)).toBeInTheDocument(); expect(screen.queryByText("Self")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button",{ name: "Create / replace invitation" }));
    expect(await screen.findByRole("link",{ name: "Open invitation" })).toHaveAttribute("href",expect.stringContaining("/events/guest/personal-token"));
    expect(issue).toHaveBeenCalledWith("friend-ticket");
  });
  it("does not offer to replace an accepted or canceled attendee’s signature", () => {
    render(<LanguageProvider initialLang="zh"><ProxyRegistrationList registrations={[{ ...ticket,attendeeConfirmationStatus: "accepted" }]} /></LanguageProvider>);
    expect(screen.getByRole("heading",{ name: "我替朋友的报名" })).toBeInTheDocument(); expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
