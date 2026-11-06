import type { Event } from "@/lib/types";

export type LodgingEvent = Pick<Event, "slug" | "title" | "eventDate">;
