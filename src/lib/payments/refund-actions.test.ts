import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/registrations/cancellation-repository", () => ({
  getCancellationRequests: async () => [],
}));

const mocks = vi.hoisted(() => ({
  createRefundAndCancel: vi.fn(),
  getRegistration: vi.fn(),
  getStripeServer: vi.fn(),
  linkPaymentIntentToRegistration: vi.fn(),
  requireSuperAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  verifyPaymentIntentForRegistration: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireSuperAdmin: mocks.requireSuperAdmin,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/payments/stripe-server", () => ({
  getStripeServer: mocks.getStripeServer,
}));
vi.mock("@/lib/payments/refunds", () => ({
  createRefundAndCancel: mocks.createRefundAndCancel,
  linkPaymentIntentToRegistration: mocks.linkPaymentIntentToRegistration,
  verifyPaymentIntentForRegistration: mocks.verifyPaymentIntentForRegistration,
}));
vi.mock("@/lib/payments/refund-repository", () => ({
  createRegistrationRefund: vi.fn(),
  getRegistrationRefund: vi.fn(),
  getRegistrationRefundByStripeId: vi.fn(),
  getRegistrationRefunds: vi.fn(),
  updateRegistrationRefund: vi.fn(),
}));
vi.mock("@/lib/registrations/repository", () => ({
  getRegistration: mocks.getRegistration,
  getRegistrations: vi.fn(),
  updateRegistrationFinance: vi.fn(),
  updateRegistrationStatus: vi.fn(),
}));

import { refundRegistrationAction } from "./refund-actions";

describe("refund admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSuperAdmin.mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "admin",
    });
    mocks.getStripeServer.mockReturnValue({});
    mocks.createRefundAndCancel.mockResolvedValue({
      success: true,
      refund: { id: "refund-1" },
    });
  });

  it("requires the super-admin guard before issuing money", async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error("admin-required"));
    const formData = new FormData();

    await expect(refundRegistrationAction(formData)).rejects.toThrow(
      "admin-required",
    );
    expect(mocks.createRefundAndCancel).not.toHaveBeenCalled();
  });

  it("requires the explicit REFUND confirmation", async () => {
    const formData = new FormData();
    formData.set("confirmation", "CANCEL");

    await expect(refundRegistrationAction(formData)).resolves.toEqual({
      success: false,
      error: "Type REFUND to confirm refund and cancellation.",
    });
    expect(mocks.createRefundAndCancel).not.toHaveBeenCalled();
  });

  it("passes the authenticated admin identity to the refund service", async () => {
    const formData = new FormData();
    formData.set("confirmation", "REFUND");
    formData.set("operationId", "11111111-1111-4111-8111-111111111111");
    formData.set("registrationId", "reg-1");
    formData.set("amount", "40");
    formData.set("reason", "requested_by_customer");
    formData.set("internalNote", "Customer request");

    await refundRegistrationAction(formData);

    expect(mocks.createRefundAndCancel).toHaveBeenCalledWith(
      expect.any(Object),
      {
        operationId: "11111111-1111-4111-8111-111111111111",
        registrationId: "reg-1",
        amount: 40,
        reason: "requested_by_customer",
        internalNote: "Customer request",
        initiatedBy: "admin-1",
      },
    );
  });
});
