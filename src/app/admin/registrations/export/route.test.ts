import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Registration } from "@/lib/types";

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn(async () => ({ id: "staff", email: "staff@example.com", role: "admin" })),
}));

const getRegistrationsMock = vi.fn<() => Promise<Registration[]>>();

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
    attendanceStatus: "unmarked",
    attendanceSource: null,
    attendanceMarkedAt: null,
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

  it("exports attendee, booker, authorization and attendance independently", async () => {
    getRegistrationsMock.mockResolvedValue([{ ...registration("friend", "event"), bookerMemberId: "booker", registrationKind: "proxy",
      attendeeEmail: "friend@example.test", attendeeConfirmationStatus: "pending" }]);
    const { GET } = await import("./route");
    const body = await (await GET(new Request("http://snowforce.test/admin/registrations/export"))).text();
    expect(body).toContain('"booker_member_id","attendee_email","registration_kind","attendee_confirmation_status","approval_status","attendance_status"');
    expect(body).toContain('"booker","friend@example.test","proxy","pending","not_required","unmarked"');
  });

  it("applies approval filters to the same independently recorded CSV status",async () => {
    getRegistrationsMock.mockResolvedValue([{ ...registration("review","event"),approvalStatus: "pending" },{ ...registration("approved","event"),approvalStatus: "approved" }]);
    const { GET } = await import("./route");
    const body = await (await GET(new Request("http://snowforce.test/admin/registrations/export?approval=pending"))).text();
    expect(body).toContain('"review","event"'); expect(body).not.toContain('"approved","event"');
  });

  it("uses the selected booker filter and escapes spreadsheet formulas in attendee names", async () => {
    getRegistrationsMock.mockResolvedValue([{ ...registration("first","event"),bookerMemberId: "one",contactName: "=HYPERLINK(\"bad\")" },
      { ...registration("second","event"),bookerMemberId: "two" }]);
    const { GET } = await import("./route");
    const body = await (await GET(new Request("http://snowforce.test/admin/registrations/export?booker=one"))).text();
    expect(body).toContain("'=HYPERLINK"); expect(body).not.toContain('"second"');
  });
});
