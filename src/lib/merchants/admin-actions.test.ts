import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getCurrentStaffAccount: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin, getCurrentStaffAccount: mocks.getCurrentStaffAccount }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("./application-state", () => ({
  __setMerchantStateDepsForTests: vi.fn(),
  allocateMerchantBoothResult: vi.fn(),
  approveMerchantApplicationResult: vi.fn(),
  publishBoothInstructionsResult: vi.fn(),
  recordMerchantManualPaymentResult: vi.fn(),
  reviewMerchantApplicationResult: vi.fn(),
  submitMerchantApplicationResult: vi.fn(),
  withdrawMerchantApplicationResult: vi.fn(),
}));

import { reviewMerchantApplicationAction } from "./actions";

describe("merchant staff actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects review mutation when the staff guard denies access", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("staff-required"));
    const formData = new FormData();
    formData.set("applicationId", "application-1");

    await expect(reviewMerchantApplicationAction(formData)).rejects.toThrow("staff-required");
    expect(mocks.getCurrentStaffAccount).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
