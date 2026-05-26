import type { Event } from "@/lib/types";
import { createClient } from "@supabase/supabase-js";
import {
  eventAggregateToWriteRows,
  rowsToEvent,
  type EventAggregateWriteRows,
  type EventCoreRow,
  type EventDetailModuleRow,
  type EventRegistrationQuestionRow,
} from "./mappers";
import { seedEvents } from "./seed";

const eventColumns = [
  "slug",
  "status",
  "registration_state",
  "title_zh",
  "title_en",
  "event_date",
  "meet_time",
  "meet_location_zh",
  "meet_location_en",
  "activity_location_zh",
  "activity_location_en",
  "location_url",
  "cover_image",
  "capacity",
  "registration_close_at",
  "requires_approval",
  "allow_waitlist",
  "allow_cancellation",
  "fee_amount",
  "payment_instructions_zh",
  "payment_instructions_en",
  "seo_title_zh",
  "seo_title_en",
  "seo_description_zh",
  "seo_description_en",
].join(",");

const questionColumns = [
  "id",
  "event_slug",
  "question_key",
  "type",
  "required",
  "sort_order",
  "label_zh",
  "label_en",
  "help_zh",
  "help_en",
  "options_zh",
  "options_en",
].join(",");

const moduleColumns = [
  "id",
  "event_slug",
  "module_type",
  "display_mode",
  "sort_order",
  "title_zh",
  "title_en",
  "content_zh",
  "content_en",
  "items_zh",
  "items_en",
].join(",");

export type EventSource = {
  listPublicEvents(): Promise<EventCoreRow[]>;
  listAdminEvents(): Promise<EventCoreRow[]>;
  getPublicEvent(slug: string): Promise<EventCoreRow | undefined>;
  getAdminEvent(slug: string): Promise<EventCoreRow | undefined>;
  listQuestions(slugs: string[]): Promise<EventRegistrationQuestionRow[]>;
  listModules(slugs: string[]): Promise<EventDetailModuleRow[]>;
  saveAggregate(rows: EventAggregateWriteRows): Promise<EventCoreRow>;
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
    async listPublicEvents() {
      const { data, error } = await createPublicEventClient()
        .from("events")
        .select(eventColumns)
        .order("event_date", { ascending: true, nullsFirst: false });
      throwSupabaseError(error);
      return (data ?? []) as unknown as EventCoreRow[];
    },
    async listAdminEvents() {
      const { data, error } = await createAdminEventClient()
        .from("events")
        .select(eventColumns)
        .order("event_date", { ascending: true, nullsFirst: false });
      throwSupabaseError(error);
      return (data ?? []) as unknown as EventCoreRow[];
    },
    async getPublicEvent(slug) {
      const { data, error } = await createPublicEventClient()
        .from("events")
        .select(eventColumns)
        .eq("slug", slug)
        .maybeSingle();
      throwSupabaseError(error);
      return (data ?? undefined) as EventCoreRow | undefined;
    },
    async getAdminEvent(slug) {
      const { data, error } = await createAdminEventClient()
        .from("events")
        .select(eventColumns)
        .eq("slug", slug)
        .maybeSingle();
      throwSupabaseError(error);
      return (data ?? undefined) as EventCoreRow | undefined;
    },
    async listQuestions(slugs) {
      if (slugs.length === 0) return [];

      const { data, error } = await createAdminEventClient()
        .from("event_registration_questions")
        .select(questionColumns)
        .in("event_slug", slugs)
        .order("sort_order", { ascending: true });
      throwSupabaseError(error);
      return (data ?? []) as unknown as EventRegistrationQuestionRow[];
    },
    async listModules(slugs) {
      if (slugs.length === 0) return [];

      const { data, error } = await createAdminEventClient()
        .from("event_detail_modules")
        .select(moduleColumns)
        .in("event_slug", slugs)
        .order("sort_order", { ascending: true });
      throwSupabaseError(error);
      return (data ?? []) as unknown as EventDetailModuleRow[];
    },
    async saveAggregate(rows) {
      const client = createAdminEventClient();

      const { error: eventError } = await client.from("events").upsert(rows.core);
      throwSupabaseError(eventError);

      const { error: questionDeleteError } = await client
        .from("event_registration_questions")
        .delete()
        .eq("event_slug", rows.core.slug);
      throwSupabaseError(questionDeleteError);

      const { error: moduleDeleteError } = await client
        .from("event_detail_modules")
        .delete()
        .eq("event_slug", rows.core.slug);
      throwSupabaseError(moduleDeleteError);

      if (rows.questions.length > 0) {
        const { error } = await client.from("event_registration_questions").insert(rows.questions);
        throwSupabaseError(error);
      }

      if (rows.modules.length > 0) {
        const { error } = await client.from("event_detail_modules").insert(rows.modules);
        throwSupabaseError(error);
      }

      const { data, error } = await client
        .from("events")
        .select(eventColumns)
        .eq("slug", rows.core.slug)
        .single();
      throwSupabaseError(error);
      return data as unknown as EventCoreRow;
    },
  };
}

export function createEventRepository(source: EventSource, countSource?: RegistrationCountSource) {
  function rowsForSlug<TRow extends { event_slug: string }>(rows: TRow[], slug: string) {
    return rows.filter((row) => row.event_slug === slug);
  }

  async function rowsToEvents(rows: EventCoreRow[]) {
    const slugs = rows.map((row) => row.slug);
    const [questions, modules] = await Promise.all([
      source.listQuestions(slugs),
      source.listModules(slugs),
    ]);
    return rows.map((row) =>
      rowsToEvent(row, rowsForSlug(questions, row.slug), rowsForSlug(modules, row.slug)),
    );
  }

  async function loadEvent(row: EventCoreRow) {
    return (await rowsToEvents([row]))[0];
  }

  async function withRegistrationCounts(rows: EventCoreRow[]) {
    const events = await rowsToEvents(rows);
    if (!countSource || events.length === 0) return events;

    const counts = await countSource.countForEvents(events.map((event) => event.slug));
    return events.map((event) => ({
      ...event,
      registrationCount: counts.get(event.slug) ?? 0,
    }));
  }

  async function withRegistrationCount(row: EventCoreRow | undefined) {
    return (await withRegistrationCounts(row ? [row] : []))[0];
  }

  return {
    async getEvents() {
      return withRegistrationCounts(
        (await source.listPublicEvents()).filter((row) => row.status === "published"),
      );
    },
    async getAllEvents() {
      return withRegistrationCounts(await source.listAdminEvents());
    },
    async getEvent(slug: string) {
      const row = await source.getPublicEvent(slug);
      return row?.status === "published" ? withRegistrationCount(row) : undefined;
    },
    async getEventAdmin(slug: string) {
      const row = await source.getAdminEvent(slug);
      return row ? withRegistrationCount(row) : undefined;
    },
    async createEvent(event: Event) {
      return loadEvent(await source.saveAggregate(eventAggregateToWriteRows(event)));
    },
    async updateEvent(slug: string, data: Partial<Event>) {
      const current = await source.getAdminEvent(slug);
      if (!current) return undefined;
      const currentEvent = await loadEvent(current);
      return loadEvent(
        await source.saveAggregate(eventAggregateToWriteRows({ ...currentEvent, ...data })),
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
