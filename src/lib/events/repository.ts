import type { Event } from "@/lib/types";
import { createClient } from "@supabase/supabase-js";
import { eventToRow, rowToEvent, type EventRow, type EventWriteRow } from "./mappers";
import { seedEvents } from "./seed";

const eventColumns = [
  "slug",
  "status",
  "registration_state",
  "title_en",
  "title_zh",
  "subtitle_en",
  "subtitle_zh",
  "description_en",
  "description_zh",
  "highlights_en",
  "highlights_zh",
  "audience_level_en",
  "audience_level_zh",
  "schedule_en",
  "schedule_zh",
  "location_en",
  "location_zh",
  "location_url",
  "fee_info_en",
  "fee_info_zh",
  "notices_en",
  "notices_zh",
  "cover_image",
  "media",
  "capacity",
  "registration_open_at",
  "registration_close_at",
  "event_start_at",
  "event_end_at",
  "registration_fields",
  "tags_en",
  "tags_zh",
  "seo_title_en",
  "seo_title_zh",
  "seo_description_en",
  "seo_description_zh",
].join(",");

export type EventSource = {
  listPublic(): Promise<EventRow[]>;
  listAdmin(): Promise<EventRow[]>;
  getPublic(slug: string): Promise<EventRow | undefined>;
  getAdmin(slug: string): Promise<EventRow | undefined>;
  upsertAdmin(row: EventWriteRow): Promise<EventRow>;
};

export type RegistrationCountSource = {
  countForEvents(slugs: string[]): Promise<Map<string, number>>;
};

function throwSupabaseError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Supabase URL is not configured.");
  return url;
}

function createPublicEventClient() {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("Supabase publishable key is not configured.");

  return createClient(getSupabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createAdminEventClient() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Supabase admin writes are not configured.");

  return createClient(getSupabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function supabaseEventSource(): EventSource {
  return {
    async listPublic() {
      const { data, error } = await createPublicEventClient()
        .from("events")
        .select(eventColumns)
        .order("event_start_at", { ascending: true, nullsFirst: false });
      throwSupabaseError(error);
      return (data ?? []) as unknown as EventRow[];
    },
    async listAdmin() {
      const { data, error } = await createAdminEventClient()
        .from("events")
        .select(eventColumns)
        .order("event_start_at", { ascending: true, nullsFirst: false });
      throwSupabaseError(error);
      return (data ?? []) as unknown as EventRow[];
    },
    async getPublic(slug) {
      const { data, error } = await createPublicEventClient()
        .from("events")
        .select(eventColumns)
        .eq("slug", slug)
        .maybeSingle();
      throwSupabaseError(error);
      return (data ?? undefined) as EventRow | undefined;
    },
    async getAdmin(slug) {
      const { data, error } = await createAdminEventClient()
        .from("events")
        .select(eventColumns)
        .eq("slug", slug)
        .maybeSingle();
      throwSupabaseError(error);
      return (data ?? undefined) as EventRow | undefined;
    },
    async upsertAdmin(row) {
      const { data, error } = await createAdminEventClient()
        .from("events")
        .upsert(row)
        .select(eventColumns)
        .single();
      throwSupabaseError(error);
      return data as unknown as EventRow;
    },
  };
}

export function createEventRepository(source: EventSource, countSource?: RegistrationCountSource) {
  async function withRegistrationCounts(rows: EventRow[]) {
    const events = rows.map(rowToEvent);
    if (!countSource || events.length === 0) return events;

    const counts = await countSource.countForEvents(events.map((event) => event.slug));
    return events.map((event) => ({
      ...event,
      registrationCount: counts.get(event.slug) ?? 0,
    }));
  }

  async function withRegistrationCount(row: EventRow | undefined) {
    return (await withRegistrationCounts(row ? [row] : []))[0];
  }

  return {
    async getEvents() {
      return withRegistrationCounts(
        (await source.listPublic()).filter((row) => row.status === "published"),
      );
    },
    async getAllEvents() {
      return withRegistrationCounts(await source.listAdmin());
    },
    async getEvent(slug: string) {
      const row = await source.getPublic(slug);
      return row?.status === "published" ? withRegistrationCount(row) : undefined;
    },
    async getEventAdmin(slug: string) {
      const row = await source.getAdmin(slug);
      return row ? withRegistrationCount(row) : undefined;
    },
    async createEvent(event: Event) {
      return rowToEvent(await source.upsertAdmin(eventToRow(event)));
    },
    async updateEvent(slug: string, data: Partial<Event>) {
      const current = await source.getAdmin(slug);
      if (!current) return undefined;
      return rowToEvent(
        await source.upsertAdmin(eventToRow({ ...rowToEvent(current), ...data })),
      );
    },
  };
}

function supabaseRegistrationCountSource(): RegistrationCountSource {
  return {
    async countForEvents(slugs) {
      if (slugs.length === 0) return new Map();

      const { data, error } = await createAdminEventClient()
        .from("registrations")
        .select("event_slug,status")
        .in("event_slug", slugs)
        .neq("status", "cancelled");
      throwSupabaseError(error);

      const counts = new Map(slugs.map((slug) => [slug, 0]));
      for (const registration of (data ?? []) as Array<{ event_slug: string }>) {
        counts.set(registration.event_slug, (counts.get(registration.event_slug) ?? 0) + 1);
      }
      return counts;
    },
  };
}

const repository = createEventRepository(supabaseEventSource(), supabaseRegistrationCountSource());
const registrations: Map<string, number> = new Map(seedEvents.map((e) => [e.slug, e.registrationCount]));

export const getEvents = repository.getEvents;
export const getAllEvents = repository.getAllEvents;
export const getEvent = repository.getEvent;
export const getEventAdmin = repository.getEventAdmin;
export const createEvent = repository.createEvent;
export const updateEvent = repository.updateEvent;

export function getRegistrationCount(slug: string): number {
  return registrations.get(slug) ?? 0;
}

export function incrementRegistrationCount(slug: string): number {
  const current = registrations.get(slug) ?? 0;
  registrations.set(slug, current + 1);
  return current + 1;
}
