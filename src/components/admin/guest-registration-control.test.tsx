import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/lib/language";
import type { Registration } from "@/lib/types";
const mocks = vi.hoisted(() => ({
  checkin: vi.fn(),
  issue: vi.fn(),
  revoke: vi.fn(),
  review: vi.fn(),
}));
vi.mock("@/lib/registrations/guest-actions", () => ({
  staffGuestCheckinAction: mocks.checkin,
  staffGuestInvitationAction: mocks.issue,
  staffRevokeGuestInvitationAction: mocks.revoke,
  staffReviewProxyRegistrationAction: mocks.review,
}));
import { GuestRegistrationControl } from "./guest-registration-control";
const ticket: Registration = {
  id: "ticket",
  eventSlug: "ride",
  memberId: null,
  bookerMemberId: "booker",
  registrationKind: "proxy",
  attendeeConfirmationStatus: "pending",
  answers: {},
  consentGiven: true,
  contactName: "Friend",
  contactEmail: "payer@example.test",
  contactPhone: "",
  status: "confirmed",
  attendanceStatus: "unmarked",
  attendanceSource: null,
  attendanceMarkedAt: null,
  createdAt: "2026-10-22",
  updatedAt: "2026-10-22",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkin.mockResolvedValue({ success: true });
  mocks.revoke.mockResolvedValue({ success: true });
});
describe("staff guest controls", () => {
  it.each(["Approve attendee"])(
    "provides %s while blocking signed but unapproved check-in",
    async (label) => {
      mocks.review.mockResolvedValue({ success: true });
      render(
        <LanguageProvider initialLang="en">
          <GuestRegistrationControl
            registration={{
              ...ticket,
              attendeeConfirmationStatus: "accepted",
              approvalStatus: "pending",
            }}
          />
        </LanguageProvider>,
      );
      expect(
        screen.queryByRole("button", { name: "Check in attendee" }),
      ).not.toBeInTheDocument();
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: label }));
      expect(await screen.findByRole("status")).toHaveTextContent(
        "Review saved",
      );
      const form = mocks.review.mock.calls[0][0] as FormData;
      expect(form.get("decision")).toBe(
        label === "Approve attendee" ? "approve" : "reject",
      );
    },
  );
  it("routes cancellation to admin review instead of offering a direct rejection", () => {
    render(
      <LanguageProvider initialLang="en">
        <GuestRegistrationControl
          registration={{ ...ticket, approvalStatus: "pending" }}
        />
      </LanguageProvider>,
    );
    expect(
      screen.queryByRole("button", { name: "Reject / review refund" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Review cancellation with an admin" }),
    ).toHaveAttribute("href", "/admin/registrations?event=ride#cancellations");
  });
  it("keeps unsigned guests out of the check-in flow and allows revocation", async () => {
    render(
      <LanguageProvider initialLang="en">
        <GuestRegistrationControl registration={ticket} />
      </LanguageProvider>,
    );
    expect(
      screen.queryByRole("button", { name: "Check in attendee" }),
    ).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Revoke invitation" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Invitation revoked",
    );
    expect(
      (mocks.revoke.mock.calls[0][0] as FormData).get("registrationId"),
    ).toBe("ticket");
  });
  it("requires a staff identity check and submits only the individual attendee’s ticket", async () => {
    render(
      <LanguageProvider initialLang="en">
        <GuestRegistrationControl
          registration={{ ...ticket, attendeeConfirmationStatus: "accepted" }}
        />
      </LanguageProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Check in attendee" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Checked in");
    const form = mocks.checkin.mock.calls[0][0] as FormData;
    expect(form.get("registrationId")).toBe("ticket");
    expect(form.get("identityChecked")).toBe("on");
  });
});
