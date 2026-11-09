import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAllEvents: vi.fn(),
  getRegistrations: vi.fn(),
  getInquiries: vi.fn(),
  getRecaps: vi.fn(),
  getFAQs: vi.fn(),
  getCancellationRequests: vi.fn(),
}));

vi.mock("@/lib/registrations/cancellation-repository", () => ({ getCancellationRequests: mocks.getCancellationRequests }));

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
  mocks.getCancellationRequests.mockResolvedValue([]);
});

describe("AdminDashboard", () => {
  it("preserves other work and marks failed sources instead of showing false zero counts", async () => {
    mocks.getAllEvents.mockRejectedValueOnce(new Error("offline"));
    mocks.getInquiries.mockRejectedValueOnce(new Error("offline"));
    mocks.getCancellationRequests.mockRejectedValueOnce(new Error("offline"));
    const page = await AdminDashboard();
    expect(page.props.unavailable).toEqual(["events", "inquiries", "cancellations"]);
    expect(page.props.stats.find((stat: { key: string }) => stat.key === "events").value).toBeNull();
    expect(page.props.stats.find((stat: { key: string }) => stat.key === "registrations").value).toBe(0);
  });

  it("shows new inquiries and does not serialize unnecessary contact fields", async () => {
    mocks.getInquiries.mockResolvedValueOnce([
      { id: "new", status: "new", organizationName: "Partner", contactName: "Pat", contactEmail: "pat@example.com", contactPhone: "private", message: "Hello" },
      { id: "old", status: "contacted" },
    ]);
    const page = await AdminDashboard();
    expect(page.props.inquiries).toEqual([{ id: "new", organizationName: "Partner", contactName: "Pat", contactEmail: "pat@example.com", message: "Hello" }]);
  });

  it("fails closed before reading operational data when staff authentication is absent", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("staff-required"));

    await expect(AdminDashboard()).rejects.toThrow("staff-required");
    expect(mocks.getAllEvents).not.toHaveBeenCalled();
    expect(mocks.getRegistrations).not.toHaveBeenCalled();
    expect(mocks.getInquiries).not.toHaveBeenCalled();
    expect(mocks.getCancellationRequests).not.toHaveBeenCalled();
  });

  it("loads dashboard data only after the admin guard passes", async () => {
    await AdminDashboard();

    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.getAllEvents).toHaveBeenCalledOnce();
    expect(mocks.getRegistrations).toHaveBeenCalledOnce();
    expect(mocks.getInquiries).toHaveBeenCalledOnce();
    expect(mocks.getRecaps).toHaveBeenCalledOnce();
    expect(mocks.getCancellationRequests).toHaveBeenCalledOnce();
  });
});
