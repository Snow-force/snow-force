import { describe, expect, it } from "vitest";

import type { Event, Registration } from "@/lib/types";
import { buildAdminRegistrationEventView, registrationDisplayEmail, registrationDisplayName } from "./admin-view";

function registration(
  id: string,
  eventSlug: string,
  createdAt: string,
  memberId: string | null = null,
): Registration {
  return {
    id,
    eventSlug,
    memberId,
    answers: {},
    consentGiven: true,
    contactEmail: `${id}@example.com`,
    contactName: id,
    contactPhone: "",
    status: "confirmed",
    createdAt,
    updatedAt: createdAt,
  };
}

function event(slug: string, titleEn: string, titleZh = ""): Event {
  return {
    slug,
    status: "archived",
    registrationState: "closed",
    title: { en: titleEn, zh: titleZh },
    eventDate: "",
    meetTime: "",
    meetLocation: { en: "", zh: "" },
    activityLocation: { en: "", zh: "" },
    locationUrl: "",
    coverImage: "",
    capacity: 0,
    registrationCount: 0,
    registrationCloseAt: "",
    requiresApproval: false,
    allowWaitlist: false,
    allowCancellation: false,
    feeAmount: "",
    paymentInstructions: { en: "", zh: "" },
    seoTitle: { en: "", zh: "" },
    seoDescription: { en: "", zh: "" },
    registrationQuestions: [],
    detailModules: [],
  };
}

describe("buildAdminRegistrationEventView", () => {
  it("filters registrations to the requested event", () => {
    const view = buildAdminRegistrationEventView({
      registrations: [
        registration("first", "smoke-draft-event-1", "2026-06-01T00:00:00.000Z"),
        registration("second", "smoke-draft-event-2", "2026-06-02T00:00:00.000Z"),
      ],
      eventsBySlug: new Map([
        ["smoke-draft-event-1", event("smoke-draft-event-1", "Smoke Draft 1")],
        ["smoke-draft-event-2", event("smoke-draft-event-2", "Smoke Draft 2")],
      ]),
      requestedEventSlug: "smoke-draft-event-2",
    });

    expect(view.selectedEventSlug).toBe("smoke-draft-event-2");
    expect(view.selectedRegistrations.map((item) => item.id)).toEqual(["second"]);
    expect(view.selectedEventLabel).toBe("Smoke Draft 2");
  });

  it("falls back to the event with the newest registration when the request is missing or invalid", () => {
    const registrations = [
      registration("older", "older-event", "2026-05-31T00:00:00.000Z"),
      registration("newer", "newer-event", "2026-06-03T00:00:00.000Z"),
      registration("middle", "middle-event", "2026-06-02T00:00:00.000Z"),
    ];

    expect(
      buildAdminRegistrationEventView({
        registrations,
        eventsBySlug: new Map(),
        requestedEventSlug: undefined,
      }).selectedEventSlug,
    ).toBe("newer-event");

    expect(
      buildAdminRegistrationEventView({
        registrations,
        eventsBySlug: new Map(),
        requestedEventSlug: "not-in-the-list",
      }).selectedEventSlug,
    ).toBe("newer-event");
  });

  it("uses archived event titles when available and falls back to the slug", () => {
    const view = buildAdminRegistrationEventView({
      registrations: [
        registration("known", "archived-event", "2026-06-01T00:00:00.000Z"),
        registration("unknown", "missing-event", "2026-06-02T00:00:00.000Z"),
      ],
      eventsBySlug: new Map([["archived-event", event("archived-event", "", "归档活动")]]),
      requestedEventSlug: "archived-event",
    });

    expect(view.eventOptions).toEqual([
      { slug: "archived-event", label: "归档活动", count: 1 },
      { slug: "missing-event", label: "missing-event", count: 1 },
    ]);
  });
});

describe("admin registration display helpers", () => {
  it("displays the stored contact name without guessing a fallback", () => {
    expect(registrationDisplayName(registration("blank", "event", "2026-06-01T00:00:00.000Z"))).toBe("blank");
    expect(
      registrationDisplayName({
        ...registration("blank", "event", "2026-06-01T00:00:00.000Z"),
        contactName: "",
        contactEmail: "rider@example.com",
      }),
    ).toBe("");
    expect(
      registrationDisplayName({
        ...registration("blank", "event", "2026-06-01T00:00:00.000Z"),
        contactName: "",
        contactEmail: "",
        memberId: "member-1",
      }),
    ).toBe("");
  });

  it("displays the stored contact email without guessing a fallback", () => {
    expect(
      registrationDisplayEmail({
        ...registration("blank", "event", "2026-06-01T00:00:00.000Z"),
        contactEmail: "",
      }),
    ).toBe("");
  });
});
