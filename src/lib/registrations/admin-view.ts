import type { Event, Registration } from "@/lib/types";

export type AdminRegistrationEventOption = {
  slug: string;
  label: string;
  count: number;
};

export type AdminRegistrationEventView = {
  eventOptions: AdminRegistrationEventOption[];
  selectedEventSlug: string;
  selectedEventLabel: string;
  selectedEvent: Event | undefined;
  selectedRegistrations: Registration[];
};

function eventLabel(event: Event | undefined, slug: string) {
  return event?.title.en || event?.title.zh || slug;
}

export function registrationDisplayName(registration: Registration) {
  return registration.contactName.trim();
}

export function registrationDisplayEmail(registration: Registration) {
  return registration.contactEmail.trim();
}

function newestRegistrationEventSlug(registrations: Registration[]) {
  return registrations.reduce<Registration | undefined>((newest, registration) => {
    if (!newest) return registration;
    return Date.parse(registration.createdAt) > Date.parse(newest.createdAt) ? registration : newest;
  }, undefined)?.eventSlug;
}

export function buildAdminRegistrationEventView({
  registrations,
  eventsBySlug,
  requestedEventSlug,
}: {
  registrations: Registration[];
  eventsBySlug: Map<string, Event>;
  requestedEventSlug?: string;
}): AdminRegistrationEventView {
  const eventCounts = new Map<string, number>();
  for (const registration of registrations) {
    eventCounts.set(registration.eventSlug, (eventCounts.get(registration.eventSlug) ?? 0) + 1);
  }

  const eventOptions = Array.from(eventCounts, ([slug, count]) => ({
    slug,
    label: eventLabel(eventsBySlug.get(slug), slug),
    count,
  }));

  const selectedEventSlug =
    requestedEventSlug && eventCounts.has(requestedEventSlug)
      ? requestedEventSlug
      : newestRegistrationEventSlug(registrations) ?? "";
  const selectedEvent = selectedEventSlug ? eventsBySlug.get(selectedEventSlug) : undefined;

  return {
    eventOptions,
    selectedEventSlug,
    selectedEventLabel: selectedEventSlug ? eventLabel(selectedEvent, selectedEventSlug) : "",
    selectedEvent,
    selectedRegistrations: selectedEventSlug
      ? registrations.filter((registration) => registration.eventSlug === selectedEventSlug)
      : [],
  };
}
