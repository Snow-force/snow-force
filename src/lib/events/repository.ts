import type { Event } from "@/lib/types";
import { createClient } from "@supabase/supabase-js";
import {
  eventAggregateToWriteRows,
  rowsToEvent,
  type EventAggregateWriteRows,
  type EventBoothPlanRow,
  type EventBoothProgramRows,
  type EventCoreRow,
  type EventDetailModuleRow,
  type EventPhysicalBoothRow,
  type EventRegistrationQuestionRow,
} from "./mappers";
import { seedEvents } from "./seed";
import { selectPublicDisplayEvents } from "./public-display";

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
  "allow_proxy_registrations",
  "max_proxy_registrations",
  "fee_amount",
  "payment_model",
  "deposit_amount",
  "deposit_currency",
  "full_payment_amount",
  "payment_instructions_zh",
  "payment_instructions_en",
  "waiver_text_en",
  "waiver_text_sha",
  "review_config",
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

const boothProgramColumns = [
  "event_slug",
  "enabled",
  "payment_instructions_en",
  "payment_instructions_zh",
].join(",");

const boothPlanColumns = [
  "id",
  "booth_program_id",
  "name_en",
  "name_zh",
  "description_en",
  "description_zh",
  "price_amount",
  "price_currency",
].join(",");

const physicalBoothColumns = [
  "id",
  "booth_program_id",
  "booth_plan_id",
  "booth_code",
].join(",");

export type EventBoothProgramSourceData = EventBoothProgramRows | null;

export type EventSource = {
  listPublicEvents(): Promise<EventCoreRow[]>;
  listAdminEvents(): Promise<EventCoreRow[]>;
  getPublicEvent(slug: string): Promise<EventCoreRow | undefined>;
  getAdminEvent(slug: string): Promise<EventCoreRow | undefined>;
  listQuestions(slugs: string[]): Promise<EventRegistrationQuestionRow[]>;
  listModules(slugs: string[]): Promise<EventDetailModuleRow[]>;
  loadBoothProgram(slug: string): Promise<EventBoothProgramSourceData>;
  saveAggregate(rows: EventAggregateWriteRows): Promise<EventCoreRow>;
};

export type RegistrationCountSource = {
  countForEvents(slugs: string[]): Promise<Map<string, number>>;
};

type EventAggregateSaveArguments = {
  readonly p_core: EventAggregateWriteRows["core"];
  readonly p_questions: EventAggregateWriteRows["questions"];
  readonly p_modules: EventAggregateWriteRows["modules"];
  readonly p_merchant_booth_program: EventAggregateWriteRows["merchantBoothProgram"];
  readonly p_review_config: EventAggregateWriteRows["reviewConfig"];
};

type EventAggregateSaveClient = {
  readonly rpc: (
    functionName: "save_event_aggregate",
    arguments_: EventAggregateSaveArguments,
  ) => PromiseLike<{
    readonly data: EventCoreRow | null;
    readonly error: { readonly message: string } | null;
  }>;
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

export async function saveEventAggregate(
  client: EventAggregateSaveClient,
  rows: EventAggregateWriteRows,
): Promise<EventCoreRow> {
  const { data, error } = await client.rpc("save_event_aggregate", {
    p_core: rows.core,
    p_questions: rows.questions,
    p_modules: rows.modules,
    p_merchant_booth_program: rows.merchantBoothProgram,
    p_review_config: rows.reviewConfig,
  });
  throwSupabaseError(error);
  if (!data) throw new Error("Event aggregate save returned no event row.");
  return data;
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
    async loadBoothProgram(slug) {
      const admin = createAdminEventClient();
      const { data: programRow, error: programError } = await admin
        .from("merchant_booth_programs")
        .select("id,event_slug,enabled,payment_instructions_en,payment_instructions_zh")
        .eq("event_slug", slug)
        .maybeSingle();
      throwSupabaseError(programError);
      if (!programRow) return null;
      const programId = (programRow as { id: string }).id;
      const [{ data: planRows, error: planError }, { data: boothRows, error: boothError }] =
        await Promise.all([
          admin
            .from("merchant_booth_plans")
            .select(boothPlanColumns)
            .eq("booth_program_id", programId),
          admin
            .from("merchant_physical_booths")
            .select(physicalBoothColumns)
            .eq("booth_program_id", programId),
        ]);
      throwSupabaseError(planError);
      throwSupabaseError(boothError);
      return {
        program: {
          event_slug: (programRow as { event_slug: string }).event_slug,
          enabled: (programRow as { enabled: boolean }).enabled,
          payment_instructions_en: (programRow as { payment_instructions_en: string })
            .payment_instructions_en,
          payment_instructions_zh: (programRow as { payment_instructions_zh: string })
            .payment_instructions_zh,
        },
        plans: (planRows ?? []) as unknown as EventBoothPlanRow[],
        booths: (boothRows ?? []) as unknown as EventPhysicalBoothRow[],
      };
    },
    async saveAggregate(rows) {
      return saveEventAggregate(createAdminEventClient(), rows);
    },
  };
}

export function createEventRepository(source: EventSource, countSource?: RegistrationCountSource) {
  function rowsForSlug<TRow extends { event_slug: string }>(rows: TRow[], slug: string) {
    return rows.filter((row) => row.event_slug === slug);
  }

  async function rowsToEvents(rows: EventCoreRow[]) {
    const slugs = rows.map((row) => row.slug);
    const [questions, modules, boothPrograms] = await Promise.all([
      source.listQuestions(slugs),
      source.listModules(slugs),
      Promise.all(slugs.map((slug) => source.loadBoothProgram(slug))),
    ]);
    return rows.map((row, index) =>
      rowsToEvent(
        row,
        rowsForSlug(questions, row.slug),
        rowsForSlug(modules, row.slug),
        boothPrograms[index] ?? null,
      ),
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
    async getPublicDisplayEvents() {
      return selectPublicDisplayEvents(
        await withRegistrationCounts(
          (await source.listPublicEvents()).filter((row) => row.status === "published"),
        ),
      );
    },
    async getAllEvents() {
      return withRegistrationCounts(
        (await source.listAdminEvents()).filter((row) => row.status !== "archived"),
      );
    },
    async getAdminEventHistory() {
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
export const getPublicDisplayEvents = repository.getPublicDisplayEvents;
export const getAllEvents = repository.getAllEvents;
export const getAdminEventHistory = repository.getAdminEventHistory;
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
