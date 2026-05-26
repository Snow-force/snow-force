import type { Event } from "../types";

export function isUnlimitedCapacity(event: Event): boolean {
  return event.capacity === 0;
}

export function remainingCapacity(event: Event): number | undefined {
  if (isUnlimitedCapacity(event)) return undefined;
  return Math.max(event.capacity - event.registrationCount, 0);
}

export function hasRemainingCapacity(event: Event): boolean {
  return isUnlimitedCapacity(event) || event.registrationCount < event.capacity;
}

export function isEventOpen(event: Event): boolean {
  if (event.status !== "published") return false;
  if (event.registrationState !== "open") return false;

  const now = new Date();
  if (event.registrationCloseAt && new Date(event.registrationCloseAt) < now) return false;

  return hasRemainingCapacity(event);
}
