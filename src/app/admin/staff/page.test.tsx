import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getStaffManagementAccounts: vi.fn() }));

vi.mock("@/lib/auth/admin", () => ({
  getStaffManagementAccounts: mocks.getStaffManagementAccounts,
  grantStaffRoleAction: vi.fn(),
  revokeStaffRoleAction: vi.fn(),
  updateStaffRoleAction: vi.fn(),
}));

import AdminStaffPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getStaffManagementAccounts.mockResolvedValue([]);
});

describe("AdminStaffPage", () => {
  it("propagates the super-admin guard failure instead of rendering staff records", async () => {
    mocks.getStaffManagementAccounts.mockRejectedValueOnce(new Error("staff-required"));

    await expect(AdminStaffPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("staff-required");
  });

  it("renders a clear empty state after the super-admin query succeeds", async () => {
    render(await AdminStaffPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Staff permissions")).toBeInTheDocument();
    expect(screen.getByText("No staff accounts yet.")).toBeInTheDocument();
  });
});
