import type { Event } from "../types";

export function isEventOpen(event: Event): boolean {
  if (event.status !== "published") return false;
  if (event.registrationState !== "open") return false;

  const now = new Date();
  if (!event.registrationOpenAt || new Date(event.registrationOpenAt) > now) return false;
  if (!event.registrationCloseAt || new Date(event.registrationCloseAt) < now) return false;

  return event.registrationCount < event.capacity;
}
