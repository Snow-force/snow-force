import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/language";
import type { BookingView } from "@/lib/registrations/v2/repository";
const m = vi.hoisted(() => ({ checkout: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock("@/lib/payments/actions", () => ({ createCheckoutSessionAction: m.checkout }));
vi.mock("@/lib/members/actions", () => ({ confirmMemberPendingRegistrationAction: vi.fn() }));
vi.mock("@/lib/registrations/v2/actions", () => ({ cancelBookingPlaceAction: vi.fn(), manageBookingWaiverAction: vi.fn() }));
import { EventBookingList } from "./event-booking-list";
const booking: BookingView = { id: "booking", eventSlug: "event", createdAt: "2026-10-23", participants: [{ id: "p", name: "Friend", kind: "proxy", pendingId: "pending", registrationId: null, status: "pending_payment", waiverStatus: "not_sent", signerRole: "attendee", recipient: "f***@example.test", approvalStatus: "pending", assignmentId: null, paymentModel: "deposit", quotedAmount: 99, currency: "usd", reviewRequired: false, deliveryStatus: "not_sent" }] };
beforeEach(() => { vi.resetAllMocks(); document.cookie = "lang=en;path=/"; });
it("resumes only this participant's payment and navigates to trips after a completed checkout", async () => {
  m.checkout.mockResolvedValue({ success: true, completed: true }); render(<LanguageProvider><EventBookingList bookings={[booking]} /></LanguageProvider>);
  await userEvent.click(screen.getByRole("button", { name: "Continue this person’s payment" }));
  await waitFor(() => expect(m.push).toHaveBeenCalledWith("/member/trips")); expect(m.checkout.mock.calls[0][0].get("pendingRegistrationId")).toBe("pending");
});
it("preserves the saved participant and offers retry after payment cannot open", async () => {
  m.checkout.mockRejectedValue(new Error("network")); render(<LanguageProvider><EventBookingList bookings={[booking]} /></LanguageProvider>);
  await userEvent.click(screen.getByRole("button", { name: "Continue this person’s payment" }));
  expect(await screen.findByRole("status")).toHaveTextContent("participant is saved"); expect(m.push).not.toHaveBeenCalled();
});
