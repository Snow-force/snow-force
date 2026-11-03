import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultRegistrationFinance } from "./finance";
import type { Registration } from "@/lib/types";
import { hasUnrefundedPayment } from "./cancellation";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), getRegistration: vi.fn(), updateRegistrationStatus: vi.fn(), revalidatePath: vi.fn(),
}));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("./repository", () => ({ getRegistration: mocks.getRegistration, updateRegistrationStatus: mocks.updateRegistrationStatus }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(decodeURIComponent(url.replaceAll("+", " "))); } }));
import { cancelRegistration } from "./cancellation-actions";

const registration: Registration = {
  id: "reg-1", eventSlug: "trip-1", memberId: null, answers: {}, consentGiven: true,
  contactEmail: "test@example.com", contactName: "Test", contactPhone: "",
  status: "confirmed", attendanceStatus: "unmarked", attendanceSource: null, attendanceMarkedAt: null,
  createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z",
  finance: { ...defaultRegistrationFinance, depositStatus: "paid", depositAmount: 99, paymentMethod: "stripe" },
};
function form(confirmation = "CANCEL") {
  const data = new FormData();
  data.set("id", registration.id); data.set("confirmation", confirmation); data.set("returnEvent", registration.eventSlug);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ userId: "admin", role: "admin" });
  mocks.getRegistration.mockResolvedValue(registration);
  mocks.updateRegistrationStatus.mockResolvedValue({ ...registration, status: "cancelled" });
});

describe("registration cancellation security", () => {
  it("checks staff authentication before accessing records", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("unauthorized"));
    await expect(cancelRegistration(form())).rejects.toThrow("unauthorized");
    expect(mocks.getRegistration).not.toHaveBeenCalled();
    expect(mocks.updateRegistrationStatus).not.toHaveBeenCalled();
  });
  it.each(["", "cancel", "REFUND"])("rejects missing or incorrect server confirmation %s", async (confirmation) => {
    await expect(cancelRegistration(form(confirmation))).rejects.toThrow("Type CANCEL");
    expect(mocks.updateRegistrationStatus).not.toHaveBeenCalled();
  });
  it("blocks a manager cancelling a paid registration even via a direct action call", async () => {
    mocks.requireAdmin.mockResolvedValue({ role: "manager" });
    await expect(cancelRegistration(form())).rejects.toThrow("Admin approval is required");
    expect(mocks.updateRegistrationStatus).not.toHaveBeenCalled();
  });
  it("allows explicit admin cancellation and refreshes member and event capacity views", async () => {
    await expect(cancelRegistration(form())).rejects.toThrow("No refund was issued");
    expect(mocks.updateRegistrationStatus).toHaveBeenCalledWith("reg-1", "cancelled");
    for (const path of ["/admin/registrations", "/member", "/member/trips", "/events", "/events/trip-1"]) {
      expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
    }
  });
  it("keeps manager cancellation available for unpaid registrations", async () => {
    mocks.requireAdmin.mockResolvedValue({ role: "manager" });
    mocks.getRegistration.mockResolvedValue({ ...registration, finance: defaultRegistrationFinance });
    await expect(cancelRegistration(form())).rejects.toThrow("No refund was issued");
    expect(mocks.updateRegistrationStatus).toHaveBeenCalledOnce();
  });
  it("does not report success if the registration vanished during the update", async () => {
    mocks.updateRegistrationStatus.mockResolvedValue(undefined);
    await expect(cancelRegistration(form())).rejects.toThrow("Cancellation failed");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
  it("handles already cancelled records without another mutation", async () => {
    mocks.getRegistration.mockResolvedValue({ ...registration, status: "cancelled" });
    await expect(cancelRegistration(form())).rejects.toThrow("No refund was issued");
    expect(mocks.updateRegistrationStatus).not.toHaveBeenCalled();
  });
  it("handles an unknown registration", async () => {
    mocks.getRegistration.mockResolvedValue(undefined);
    await expect(cancelRegistration(form())).rejects.toThrow("Registration was not found");
    expect(mocks.updateRegistrationStatus).not.toHaveBeenCalled();
  });
});

describe("unrefunded payment detection", () => {
  it.each([
    ["paid", 99, 0, true], ["paid", 99, 40, true], ["paid", 99, 99, false],
    ["paid", null, 0, true], ["pending", 99, 0, false], ["refunded", 99, 99, false],
  ] as const)("handles %s amount %s refunded %s", (depositStatus, depositAmount, refundedAmount, expected) => {
    expect(hasUnrefundedPayment({ finance: { ...defaultRegistrationFinance, depositStatus, depositAmount, refundedAmount } })).toBe(expected);
  });
});
