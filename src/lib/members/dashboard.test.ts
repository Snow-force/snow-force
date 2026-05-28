import { describe, expect, it } from "vitest";
import type { Event, EventRecap, MemberProfile, Registration } from "@/lib/types";
import { buildMemberDashboard } from "./dashboard";
import { defaultMemberEquipment, defaultMemberNotificationPreferences } from "./profile-fields";

const profile: MemberProfile = {
  id: "member-1",
  userId: "user-1",
  displayName: "Rider One",
  email: "rider@example.com",
  phone: "555-0100",
  riderLevel: { en: "", zh: "" },
  riderType: "snowboarder",
  structuredRiderLevel: "advanced",
  homeMountain: "Mammoth",
  bio: "",
  carpoolInterest: true,
  lodgingInterest: false,
  preferredLanguage: "en",
  instagram: "snowforce",
  discord: "rider#1234",
  avatarUrl: "",
  passes: ["ikon"],
  equipment: defaultMemberEquipment,
  savedEventSlugs: ["future-trip"],
  notificationPreferences: defaultMemberNotificationPreferences,
  emergencyContact: "Patrol",
  emergencyPhone: "555-9999",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

function event(slug: string, eventDate: string): Event {
  return {
    slug,
    status: "published",
    registrationState: "open",
    title: { en: slug, zh: slug },
    eventDate,
    meetTime: "08:00",
    meetLocation: { en: "Lot", zh: "停车场" },
    activityLocation: { en: "Mammoth", zh: "猛犸" },
    locationUrl: "",
    coverImage: `/images/${slug}.jpg`,
    capacity: 20,
    registrationCount: 3,
    registrationCloseAt: "2099-01-01T00:00:00.000Z",
    requiresApproval: false,
    allowWaitlist: true,
    allowCancellation: true,
    feeAmount: "",
    paymentInstructions: { en: "", zh: "" },
    seoTitle: { en: "", zh: "" },
    seoDescription: { en: "", zh: "" },
    registrationQuestions: [],
    detailModules: [],
  };
}

function registration(eventSlug: string, createdAt: string): Registration {
  return {
    id: `reg-${eventSlug}`,
    eventSlug,
    memberId: "member-1",
    answers: {},
    consentGiven: true,
    contactEmail: "rider@example.com",
    contactName: "Rider One",
    contactPhone: "555-0100",
    status: "confirmed",
    createdAt,
    updatedAt: createdAt,
  };
}

const recap: EventRecap = {
  slug: "recap-1",
  status: "published",
  title: { en: "Powder recap", zh: "粉雪回顾" },
  summary: { en: "A good day", zh: "很好的一天" },
  content: { en: "", zh: "" },
  date: "2026-01-10",
  location: { en: "Mammoth", zh: "猛犸" },
  coverImage: "/images/recap.jpg",
  media: [],
  tags: { en: [], zh: [] },
  seoTitle: { en: "", zh: "" },
  seoDescription: { en: "", zh: "" },
  eventSlug: "past-trip",
};

describe("member dashboard aggregation", () => {
  it("S4-dashboard-splits-upcoming-and-past-registrations", () => {
    const dashboard = buildMemberDashboard({
      profile,
      emailConfirmed: true,
      registrations: [registration("future-trip", "2026-01-01"), registration("past-trip", "2026-01-02")],
      events: [event("future-trip", "2099-02-01"), event("past-trip", "2020-02-01")],
      recaps: [recap],
      now: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(dashboard.upcomingTrips.map((item) => item.event.slug)).toEqual(["future-trip"]);
    expect(dashboard.registrationHistory.map((item) => item.registration.eventSlug)).toEqual(["past-trip"]);
  });

  it("S4-dashboard-resolves-saved-events-from-published-events", () => {
    const dashboard = buildMemberDashboard({
      profile,
      emailConfirmed: true,
      registrations: [],
      events: [event("future-trip", "2099-02-01"), event("other", "2099-03-01")],
      recaps: [],
      now: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(dashboard.savedEvents.map((item) => item.slug)).toEqual(["future-trip"]);
  });

  it("S4-dashboard-creates-email-verification-notification", () => {
    const dashboard = buildMemberDashboard({
      profile,
      emailConfirmed: false,
      registrations: [],
      events: [],
      recaps: [],
      now: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(dashboard.notifications[0]).toMatchObject({
      type: "email_verification",
      title: "Verify your email",
    });
  });

  it("S4-dashboard-limits-recent-recaps", () => {
    const dashboard = buildMemberDashboard({
      profile,
      emailConfirmed: true,
      registrations: [],
      events: [],
      recaps: Array.from({ length: 8 }, (_, index) => ({ ...recap, slug: `recap-${index}`, date: `2026-01-${index + 1}` })),
      now: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(dashboard.recentRecaps).toHaveLength(4);
    expect(dashboard.recentRecaps[0].slug).toBe("recap-7");
  });
});
