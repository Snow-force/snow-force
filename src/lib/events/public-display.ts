import { remainingCapacity } from "./availability";
import type { Event } from "@/lib/types";

function isFull(event: Event): boolean {
  return event.registrationState === "full" || remainingCapacity(event) === 0;
}

function eventDateTime(event: Event): number | undefined {
  const time = Date.parse(event.eventDate);
  return Number.isNaN(time) ? undefined : time;
}

function compareByDateThenSlug(left: Event, right: Event): number {
  const leftTime = eventDateTime(left);
  const rightTime = eventDateTime(right);

  if (leftTime === undefined && rightTime !== undefined) return 1;
  if (leftTime !== undefined && rightTime === undefined) return -1;
  if (leftTime !== undefined && rightTime !== undefined && leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return left.slug.localeCompare(right.slug);
}

/**
 * Returns active public event cards, with sold-out events grouped after events
 * that still have capacity.
 */
export function selectPublicDisplayEvents(events: Event[]): Event[] {
  return events
    .filter(
      (event) =>
        event.status === "published" &&
        (event.registrationState === "open" || event.registrationState === "full"),
    )
    .sort((left, right) => {
      const fullDifference = Number(isFull(left)) - Number(isFull(right));
      return fullDifference || compareByDateThenSlug(left, right);
    });
}
