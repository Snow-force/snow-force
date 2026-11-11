import type { Event } from "../types";

export type EventAvailabilitySnapshot = {
  readonly open: boolean;
  readonly remaining: number | undefined;
  readonly percentFull: number;
};

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

export function isEventOpen(event: Event, now = new Date()): boolean {
  if (event.status !== "published") return false;
  if (event.registrationState !== "open") return false;

  if (event.registrationCloseAt && new Date(event.registrationCloseAt) < now) return false;

  return hasRemainingCapacity(event);
}

export function getEventAvailabilitySnapshot(event: Event, now = new Date()): EventAvailabilitySnapshot {
  const remaining = remainingCapacity(event);
  return {
    open: isEventOpen(event, now),
    remaining,
    percentFull: remaining === undefined ? 0 : Math.min(Math.round((event.registrationCount / event.capacity) * 100), 100),
  };
}
