import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Registration } from "@/lib/types";

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn(async () => ({ id: "staff", email: "staff@example.com", role: "admin" })),
}));

const getRegistrationsMock = vi.fn<[], Promise<Registration[]>>();

vi.mock("@/lib/registrations/repository", () => ({
  getRegistrations: getRegistrationsMock,
}));

function registration(id: string, eventSlug: string): Registration {
  return {
    id,
    eventSlug,
    memberId: null,
    answers: {},
    consentGiven: true,
    contactEmail: `${id}@example.com`,
    contactName: id,
    contactPhone: "",
    status: "confirmed",
    createdAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z",
  };
}

describe("admin registrations export route", () => {
  beforeEach(() => {
    getRegistrationsMock.mockReset();
  });

  it("filters CSV rows by event query parameter", async () => {
    getRegistrationsMock.mockResolvedValue([
      registration("first", "smoke-draft-event-1"),
      registration("second", "smoke-draft-event-2"),
    ]);
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://snowforce.test/admin/registrations/export?event=smoke-draft-event-2"),
    );

    const body = await response.text();
    expect(body).toContain('"second","smoke-draft-event-2"');
    expect(body).not.toContain('"first","smoke-draft-event-1"');
  });
});
