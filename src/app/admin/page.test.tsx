import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAllEvents: vi.fn(),
  getRegistrations: vi.fn(),
  getInquiries: vi.fn(),
  getRecaps: vi.fn(),
  getFAQs: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/events/repository", () => ({ getAllEvents: mocks.getAllEvents }));
vi.mock("@/lib/registrations/repository", () => ({ getRegistrations: mocks.getRegistrations }));
vi.mock("@/lib/inquiries/repository", () => ({ getInquiries: mocks.getInquiries }));
vi.mock("@/lib/recaps/repository", () => ({ getRecaps: mocks.getRecaps }));
vi.mock("@/lib/faqs/repository", () => ({ getFAQs: mocks.getFAQs }));
vi.mock("@/components/admin/admin-dashboard-view", () => ({ AdminDashboardView: () => null }));

import AdminDashboard from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ userId: "staff-1", email: "staff@example.com", role: "admin" });
  mocks.getAllEvents.mockResolvedValue([]);
  mocks.getRegistrations.mockResolvedValue([]);
  mocks.getInquiries.mockResolvedValue([]);
  mocks.getRecaps.mockResolvedValue([]);
  mocks.getFAQs.mockReturnValue([]);
});

describe("AdminDashboard", () => {
  it("fails closed before reading operational data when staff authentication is absent", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("staff-required"));

    await expect(AdminDashboard()).rejects.toThrow("staff-required");
    expect(mocks.getAllEvents).not.toHaveBeenCalled();
    expect(mocks.getRegistrations).not.toHaveBeenCalled();
    expect(mocks.getInquiries).not.toHaveBeenCalled();
  });

  it("loads dashboard data only after the admin guard passes", async () => {
    await AdminDashboard();

    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.getAllEvents).toHaveBeenCalledOnce();
    expect(mocks.getRegistrations).toHaveBeenCalledOnce();
    expect(mocks.getInquiries).toHaveBeenCalledOnce();
    expect(mocks.getRecaps).toHaveBeenCalledOnce();
  });
});
