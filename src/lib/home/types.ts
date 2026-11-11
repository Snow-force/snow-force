import type { Event, EventRecap } from "@/lib/types";

/** Public discovery snapshots, never registration or album records. */
export type HomeEvent = Pick<Event, "slug" | "status" | "registrationState" | "title" | "eventDate" | "activityLocation" | "coverImage" | "feeAmount" | "meetTime" | "meetLocation" | "registrationCloseAt">;
export type HomeRecap = Pick<EventRecap, "slug" | "status" | "title" | "summary" | "date" | "location" | "coverImage">;
