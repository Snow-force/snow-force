import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createRegistration: vi.fn(),
  deletePendingRegistration: vi.fn(),
  getEvent: vi.fn(),
  getPendingRegistrationByTokenHash: vi.fn(),
  getRegistrationCountForEvent: vi.fn(),
  getRegistrations: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/events/availability", () => ({
  hasRemainingCapacity: vi.fn(() => true),
  isEventOpen: vi.fn(() => true),
}));

vi.mock("@/lib/events/repository", () => ({
  getEvent: routeMocks.getEvent,
}));

vi.mock("@/lib/registrations/repository", () => ({
  createRegistration: routeMocks.createRegistration,
  getRegistrationCountForEvent: routeMocks.getRegistrationCountForEvent,
  getRegistrations: routeMocks.getRegistrations,
}));

vi.mock("@/lib/registrations/pending-repository", () => ({
  deletePendingRegistration: routeMocks.deletePendingRegistration,
  getPendingRegistrationByTokenHash: routeMocks.getPendingRegistrationByTokenHash,
}));

vi.mock("@/lib/email/adapter", () => ({
  buildStaffNotificationEmail: vi.fn(() => ({ to: "staff@example.com", subject: "staff", html: "" })),
  sendEmail: routeMocks.sendEmail,
}));

import { GET } from "./route";

const event = {
  slug: "big-bear-day",
  title: { en: "Big Bear Day", zh: "大熊湖" },
  eventDate: "2099-01-01",
  registrationCount: 0,
};

const pending = {
  id: "pending-1",
  eventSlug: "big-bear-day",
  memberId: null,
  answers: { name: "Tai", email: "tai@example.com" },
  consentGiven: true,
  contactName: "Tai",
  contactEmail: "tai@example.com",
  contactPhone: "",
  tokenHash: "unused",
  expiresAt: "2099-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("registration confirmation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a registration from a valid pending token", async () => {
    routeMocks.getPendingRegistrationByTokenHash.mockResolvedValue(pending);
    routeMocks.getEvent.mockResolvedValue(event);
    routeMocks.getRegistrationCountForEvent.mockResolvedValue(0);
    routeMocks.getRegistrations.mockResolvedValue([]);
    routeMocks.createRegistration.mockResolvedValue({ success: true, registration: { id: "reg-1" } });
    routeMocks.deletePendingRegistration.mockResolvedValue(undefined);
    routeMocks.sendEmail.mockResolvedValue({ success: true });

    const response = await GET(new Request("http://localhost:3000/registrations/confirm?token=abc"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/events/big-bear-day?registration=confirmed");
    expect(routeMocks.createRegistration).toHaveBeenCalledWith({
      eventSlug: "big-bear-day",
      memberId: null,
      answers: { name: "Tai", email: "tai@example.com" },
      consentGiven: true,
      contactName: "Tai",
      contactEmail: "tai@example.com",
      contactPhone: "",
    });
    expect(routeMocks.deletePendingRegistration).toHaveBeenCalledWith("pending-1");
  });

  it("does not create a registration for expired pending tokens", async () => {
    routeMocks.getPendingRegistrationByTokenHash.mockResolvedValue({
      ...pending,
      expiresAt: "2000-01-01T00:00:00.000Z",
    });

    const response = await GET(new Request("http://localhost:3000/registrations/confirm?token=abc"));

    expect(response.headers.get("location")).toContain("/events?registration=expired");
    expect(routeMocks.createRegistration).not.toHaveBeenCalled();
  });
});
