import type { Event, EventRecap, MemberProfile, Registration } from "@/lib/types";

export type MemberDashboardTrip = {
  event: Event;
  registration: Registration;
};

export type MemberDashboardNotification = {
  id: string;
  type: "email_verification" | "profile_completion" | "upcoming_trip" | "saved_event";
  title: string;
  body: string;
  href: string;
};

export type MemberDashboardData = {
  upcomingTrips: MemberDashboardTrip[];
  registrationHistory: MemberDashboardTrip[];
  savedEvents: Event[];
  recentRecaps: EventRecap[];
  notifications: MemberDashboardNotification[];
  profileCompletion: number;
  quickActions: Array<{ label: string; href: string }>;
};

export type BuildMemberDashboardInput = {
  profile: MemberProfile;
  emailConfirmed: boolean;
  registrations: Registration[];
  events: Event[];
  recaps: EventRecap[];
  now?: Date;
};

function eventTime(event: Event) {
  const time = Date.parse(event.eventDate);
  return Number.isNaN(time) ? 0 : time;
}

function byEventDateAsc(a: MemberDashboardTrip, b: MemberDashboardTrip) {
  return eventTime(a.event) - eventTime(b.event);
}

function byRegistrationCreatedDesc(a: MemberDashboardTrip, b: MemberDashboardTrip) {
  return Date.parse(b.registration.createdAt) - Date.parse(a.registration.createdAt);
}

function profileCompletion(profile: MemberProfile) {
  const checks = [
    profile.displayName,
    profile.phone,
    profile.structuredRiderLevel,
    profile.riderType,
    profile.homeMountain,
    profile.emergencyContact,
    profile.emergencyPhone,
    profile.passes.length > 0,
  ];
  const complete = checks.filter(Boolean).length;
  return Math.round((complete / checks.length) * 100);
}

function buildNotifications(
  profile: MemberProfile,
  emailConfirmed: boolean,
  upcomingTrips: MemberDashboardTrip[],
  savedEvents: Event[],
): MemberDashboardNotification[] {
  const notifications: MemberDashboardNotification[] = [];
  if (!emailConfirmed) {
    notifications.push({
      id: "email-verification",
      type: "email_verification",
      title: "Verify your email",
      body: "Verify your email before using member-linked event registration.",
      href: "/member/account-settings",
    });
  }
  if (profileCompletion(profile) < 80) {
    notifications.push({
      id: "profile-completion",
      type: "profile_completion",
      title: "Complete your rider profile",
      body: "Add phone, rider level, pass, and emergency details to speed up trip registration.",
      href: "/member/settings#profile",
    });
  }
  if (upcomingTrips.length > 0) {
    notifications.push({
      id: "upcoming-trip",
      type: "upcoming_trip",
      title: "Next trip is on deck",
      body: `${upcomingTrips[0].event.title.en || upcomingTrips[0].event.title.zh} is your next SnowForce ride.`,
      href: `/events/${upcomingTrips[0].event.slug}`,
    });
  }
  if (savedEvents.length > 0) {
    notifications.push({
      id: "saved-event",
      type: "saved_event",
      title: "Saved trip open",
      body: `${savedEvents[0].title.en || savedEvents[0].title.zh} is saved to your member area.`,
      href: `/events/${savedEvents[0].slug}`,
    });
  }
  return notifications;
}

export function buildMemberDashboard({
  profile,
  emailConfirmed,
  registrations,
  events,
  recaps,
  now = new Date(),
}: BuildMemberDashboardInput): MemberDashboardData {
  const eventsBySlug = new Map(events.map((event) => [event.slug, event]));
  const trips = registrations
    .map((registration) => {
      const event = eventsBySlug.get(registration.eventSlug);
      return event ? { event, registration } : undefined;
    })
    .filter((trip): trip is MemberDashboardTrip => Boolean(trip));
  const nowTime = now.getTime();
  const upcomingTrips = trips
    .filter((trip) => eventTime(trip.event) >= nowTime && trip.registration.status !== "cancelled")
    .sort(byEventDateAsc);
  const registrationHistory = trips
    .filter((trip) => eventTime(trip.event) < nowTime || trip.registration.status === "cancelled")
    .sort(byRegistrationCreatedDesc);
  const savedEvents = profile.savedEventSlugs
    .map((slug) => eventsBySlug.get(slug))
    .filter((event): event is Event => Boolean(event));
  const recentRecaps = [...recaps]
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 4);

  return {
    upcomingTrips,
    registrationHistory,
    savedEvents,
    recentRecaps,
    notifications: buildNotifications(profile, emailConfirmed, upcomingTrips, savedEvents),
    profileCompletion: profileCompletion(profile),
    quickActions: [
      { label: "Browse open events", href: "/events" },
      { label: "Complete profile", href: "/member/settings#profile" },
      { label: "View recaps", href: "/recaps" },
    ],
  };
}
