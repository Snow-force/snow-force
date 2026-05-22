# Supabase Event Admin Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move SnowForce event content into Supabase and add a full admin event editor so staff can create, edit, publish, and operate activities without changing frontend seed code.

**Architecture:** Introduce a server-side Supabase event adapter with explicit row/domain mappers and validation around editor input. Convert public event routes and registration event lookups to async repository calls, then build admin-only server actions and forms on top of the same repository while keeping the existing password-backed admin session.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Supabase JavaScript client, Zod, Vitest

---

## File Structure

- Modify `src/lib/supabase/client.ts` to expose public read and privileged server-only admin event clients instead of only status text.
- Create `src/lib/events/mappers.ts` and `src/lib/events/mappers.test.ts` for Supabase row/domain conversion.
- Create `src/lib/events/validation.ts` and `src/lib/events/validation.test.ts` for editor parsing and publish readiness.
- Modify `src/lib/events/repository.ts` and create `src/lib/events/repository.test.ts` so event reads and writes use an injectable Supabase-shaped data boundary.
- Modify public and registration call sites under `src/app/events/*`, `src/app/page.tsx`, and `src/lib/registrations/actions.ts` for async event reads.
- Create `src/lib/events/actions.ts` for admin-only mutations and route revalidation.
- Create `src/components/admin/event-editor-form.tsx` for the full editing surface.
- Modify `src/app/admin/events/page.tsx`; create `src/app/admin/events/new/page.tsx` and `src/app/admin/events/[slug]/edit/page.tsx`.
- Modify `README.md` and `.env.example` to document the Supabase event workflow and seed import path.

## Task 1: Supabase Event Row Mapping

**Files:**
- Create: `src/lib/events/mappers.test.ts`
- Create: `src/lib/events/mappers.ts`

- [ ] **Step 1: Write the failing mapper test**

```ts
import { describe, expect, it } from "vitest";
import { eventToRow, rowToEvent } from "./mappers";

describe("event mappers", () => {
  it("maps Supabase event columns into the domain event shape", () => {
    const event = rowToEvent({
      slug: "spring-ride",
      status: "published",
      registration_state: "open",
      title_en: "Spring Ride",
      title_zh: "春季活动",
      subtitle_en: "Bluebird laps",
      subtitle_zh: "晴天滑行",
      description_en: "Meet the crew.",
      description_zh: "和大家一起滑。",
      highlights_en: ["Coach support"],
      highlights_zh: ["教练支持"],
      audience_level_en: "All levels",
      audience_level_zh: "全水平",
      schedule_en: "09:00 Meet",
      schedule_zh: "09:00 集合",
      location_en: "Mammoth",
      location_zh: "猛犸山",
      location_url: "https://maps.example.test",
      fee_info_en: "Free",
      fee_info_zh: "免费",
      notices_en: ["Helmet recommended"],
      notices_zh: ["建议戴头盔"],
      cover_image: "/images/events/spring.jpg",
      media: [],
      capacity: 40,
      registration_open_at: "2026-10-01T00:00:00.000Z",
      registration_close_at: "2026-10-05T00:00:00.000Z",
      event_start_at: "2026-10-06T16:00:00.000Z",
      event_end_at: "2026-10-06T22:00:00.000Z",
      registration_fields: [],
      tags_en: ["Ride"],
      tags_zh: ["活动"],
      seo_title_en: "Spring Ride",
      seo_title_zh: "春季活动",
      seo_description_en: "Join the ride.",
      seo_description_zh: "一起滑雪。",
    });

    expect(event.title).toEqual({ en: "Spring Ride", zh: "春季活动" });
    expect(event.registrationState).toBe("open");
    expect(event.registrationCount).toBe(0);
    expect(event.tags.zh).toEqual(["活动"]);
  });

  it("maps a domain event into Supabase write columns", () => {
    const row = eventToRow({
      slug: "draft",
      status: "draft",
      registrationState: "closed",
      title: { en: "Draft", zh: "草稿" },
      subtitle: { en: "", zh: "" },
      description: { en: "", zh: "" },
      highlights: { en: [], zh: [] },
      audienceLevel: { en: "", zh: "" },
      schedule: { en: "", zh: "" },
      location: { en: "", zh: "" },
      locationUrl: "",
      feeInfo: { en: "", zh: "" },
      notices: { en: [], zh: [] },
      coverImage: "",
      media: [],
      capacity: 0,
      registrationCount: 0,
      registrationOpenAt: "2026-10-01T00:00:00.000Z",
      registrationCloseAt: "2026-10-02T00:00:00.000Z",
      eventStartAt: "2026-10-03T00:00:00.000Z",
      eventEndAt: "2026-10-04T00:00:00.000Z",
      registrationFields: [],
      tags: { en: [], zh: [] },
      seoTitle: { en: "", zh: "" },
      seoDescription: { en: "", zh: "" },
    });

    expect(row.title_en).toBe("Draft");
    expect(row.registration_state).toBe("closed");
    expect("registrationCount" in row).toBe(false);
  });
});
```

- [ ] **Step 2: Run the mapper test to verify RED**

Run: `npm test -- src/lib/events/mappers.test.ts`

Expected: FAIL because `./mappers` does not exist.

- [ ] **Step 3: Implement minimal mapper types and conversion**

```ts
import type { Event, RegistrationFieldConfig } from "@/lib/types";

export type EventRow = {
  slug: string;
  status: Event["status"];
  registration_state: Event["registrationState"];
  title_en: string;
  title_zh: string;
  subtitle_en: string | null;
  subtitle_zh: string | null;
  description_en: string | null;
  description_zh: string | null;
  highlights_en: string[] | null;
  highlights_zh: string[] | null;
  audience_level_en: string | null;
  audience_level_zh: string | null;
  schedule_en: string | null;
  schedule_zh: string | null;
  location_en: string | null;
  location_zh: string | null;
  location_url: string | null;
  fee_info_en: string | null;
  fee_info_zh: string | null;
  notices_en: string[] | null;
  notices_zh: string[] | null;
  cover_image: string | null;
  media: string[] | null;
  capacity: number;
  registration_open_at: string | null;
  registration_close_at: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  registration_fields: RegistrationFieldConfig[] | null;
  tags_en: string[] | null;
  tags_zh: string[] | null;
  seo_title_en: string | null;
  seo_title_zh: string | null;
  seo_description_en: string | null;
  seo_description_zh: string | null;
};

export function rowToEvent(row: EventRow): Event {
  return {
    slug: row.slug,
    status: row.status,
    registrationState: row.registration_state,
    title: { en: row.title_en, zh: row.title_zh },
    subtitle: { en: row.subtitle_en ?? "", zh: row.subtitle_zh ?? "" },
    description: { en: row.description_en ?? "", zh: row.description_zh ?? "" },
    highlights: { en: row.highlights_en ?? [], zh: row.highlights_zh ?? [] },
    audienceLevel: { en: row.audience_level_en ?? "", zh: row.audience_level_zh ?? "" },
    schedule: { en: row.schedule_en ?? "", zh: row.schedule_zh ?? "" },
    location: { en: row.location_en ?? "", zh: row.location_zh ?? "" },
    locationUrl: row.location_url ?? "",
    feeInfo: { en: row.fee_info_en ?? "", zh: row.fee_info_zh ?? "" },
    notices: { en: row.notices_en ?? [], zh: row.notices_zh ?? [] },
    coverImage: row.cover_image ?? "",
    media: row.media ?? [],
    capacity: row.capacity,
    registrationCount: 0,
    registrationOpenAt: row.registration_open_at ?? "",
    registrationCloseAt: row.registration_close_at ?? "",
    eventStartAt: row.event_start_at ?? "",
    eventEndAt: row.event_end_at ?? "",
    registrationFields: row.registration_fields ?? [],
    tags: { en: row.tags_en ?? [], zh: row.tags_zh ?? [] },
    seoTitle: { en: row.seo_title_en ?? "", zh: row.seo_title_zh ?? "" },
    seoDescription: {
      en: row.seo_description_en ?? "",
      zh: row.seo_description_zh ?? "",
    },
  };
}

export function eventToRow(event: Event) {
  return {
    slug: event.slug,
    status: event.status,
    registration_state: event.registrationState,
    title_en: event.title.en,
    title_zh: event.title.zh,
    subtitle_en: event.subtitle.en,
    subtitle_zh: event.subtitle.zh,
    description_en: event.description.en,
    description_zh: event.description.zh,
    highlights_en: event.highlights.en,
    highlights_zh: event.highlights.zh,
    audience_level_en: event.audienceLevel.en,
    audience_level_zh: event.audienceLevel.zh,
    schedule_en: event.schedule.en,
    schedule_zh: event.schedule.zh,
    location_en: event.location.en,
    location_zh: event.location.zh,
    location_url: event.locationUrl,
    fee_info_en: event.feeInfo.en,
    fee_info_zh: event.feeInfo.zh,
    notices_en: event.notices.en,
    notices_zh: event.notices.zh,
    cover_image: event.coverImage,
    media: event.media,
    capacity: event.capacity,
    registration_open_at: event.registrationOpenAt,
    registration_close_at: event.registrationCloseAt,
    event_start_at: event.eventStartAt,
    event_end_at: event.eventEndAt,
    registration_fields: event.registrationFields,
    tags_en: event.tags.en,
    tags_zh: event.tags.zh,
    seo_title_en: event.seoTitle.en,
    seo_title_zh: event.seoTitle.zh,
    seo_description_en: event.seoDescription.en,
    seo_description_zh: event.seoDescription.zh,
  };
}
```

- [ ] **Step 4: Run mapper tests to verify GREEN**

Run: `npm test -- src/lib/events/mappers.test.ts`

Expected: PASS.

## Task 2: Event Editor Validation

**Files:**
- Create: `src/lib/events/validation.test.ts`
- Create: `src/lib/events/validation.ts`

- [ ] **Step 1: Write failing validation tests**

```ts
import { describe, expect, it } from "vitest";
import { parseEventEditorInput, validatePublishableEvent } from "./validation";

describe("event editor validation", () => {
  it("rejects invalid editor date ordering and negative capacity", () => {
    const result = parseEventEditorInput({
      slug: "winter-day",
      capacity: "-1",
      eventStartAt: "2026-12-03T10:00",
      eventEndAt: "2026-12-03T09:00",
      registrationOpenAt: "2026-12-02T10:00",
      registrationCloseAt: "2026-12-01T10:00",
    });

    expect(result.success).toBe(false);
  });

  it("lists missing bilingual fields before publishing", () => {
    const missing = validatePublishableEvent({
      slug: "draft",
      title: { en: "Draft", zh: "" },
      description: { en: "", zh: "" },
      location: { en: "", zh: "" },
      eventStartAt: "",
      eventEndAt: "",
      registrationOpenAt: "",
      registrationCloseAt: "",
      capacity: 0,
    } as never);

    expect(missing).toContain("title.zh");
    expect(missing).toContain("description.en");
    expect(missing).toContain("eventStartAt");
  });
});
```

- [ ] **Step 2: Run validation tests to verify RED**

Run: `npm test -- src/lib/events/validation.test.ts`

Expected: FAIL because `./validation` does not exist.

- [ ] **Step 3: Implement editor parsing helpers and publish checks**

Use `zod` to parse editor data. Support draft-safe empty strings for optional
content and parse list textarea values into string arrays in the UI layer.

```ts
import { z } from "zod";
import type { Event } from "@/lib/types";

const eventEditorSchema = z.object({
  slug: z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  capacity: z.coerce.number().int().min(0),
  eventStartAt: z.string().min(1),
  eventEndAt: z.string().min(1),
  registrationOpenAt: z.string().min(1),
  registrationCloseAt: z.string().min(1),
}).superRefine((value, ctx) => {
  if (new Date(value.eventEndAt) < new Date(value.eventStartAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["eventEndAt"], message: "Event end must follow start." });
  }
  if (new Date(value.registrationCloseAt) < new Date(value.registrationOpenAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["registrationCloseAt"], message: "Registration close must follow open." });
  }
});

export function parseEventEditorInput(input: unknown) {
  return eventEditorSchema.safeParse(input);
}

export function validatePublishableEvent(event: Event) {
  const required: Array<[string, unknown]> = [
    ["title.en", event.title.en],
    ["title.zh", event.title.zh],
    ["description.en", event.description.en],
    ["description.zh", event.description.zh],
    ["location.en", event.location.en],
    ["location.zh", event.location.zh],
    ["eventStartAt", event.eventStartAt],
    ["eventEndAt", event.eventEndAt],
    ["registrationOpenAt", event.registrationOpenAt],
    ["registrationCloseAt", event.registrationCloseAt],
  ];

  return required.filter(([, value]) => !value).map(([field]) => field);
}
```

- [ ] **Step 4: Run validation tests to verify GREEN**

Run: `npm test -- src/lib/events/validation.test.ts`

Expected: PASS.

## Task 3: Supabase Client and Event Repository

**Files:**
- Modify: `src/lib/supabase/client.ts`
- Modify: `src/lib/events/repository.ts`
- Create: `src/lib/events/repository.test.ts`

- [ ] **Step 1: Write failing repository tests around an injectable event source**

```ts
import { describe, expect, it } from "vitest";
import { createEventRepository } from "./repository";

const rows = [
  { slug: "published", status: "published", registration_state: "open", title_en: "Published", title_zh: "已发布", capacity: 1 },
  { slug: "draft", status: "draft", registration_state: "closed", title_en: "Draft", title_zh: "草稿", capacity: 1 },
] as never[];

describe("event repository", () => {
  it("filters drafts from public event reads", async () => {
    const repository = createEventRepository({
      list: async () => rows,
      get: async (slug) => rows.find((row) => row.slug === slug),
      upsert: async (row) => row,
      update: async (_slug, row) => row,
    });

    expect((await repository.getEvents()).map((event) => event.slug)).toEqual(["published"]);
    expect(await repository.getEvent("draft")).toBeUndefined();
    expect((await repository.getAllEvents()).map((event) => event.slug)).toEqual(["published", "draft"]);
  });
});
```

- [ ] **Step 2: Run repository tests to verify RED**

Run: `npm test -- src/lib/events/repository.test.ts`

Expected: FAIL because `createEventRepository` does not exist.

- [ ] **Step 3: Implement configured Supabase client helpers**

Replace the status-only client stub with helpers that distinguish missing
configuration from configured public-read and privileged server-only admin
clients.

```ts
import { createClient } from "@supabase/supabase-js";

export function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function createPublicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");
  return createClient(url, key);
}

export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin writes are not configured.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

- [ ] **Step 4: Implement event repository source and async operations**

Keep the repository source shape small enough to fake in tests. Use
`rowToEvent` and `eventToRow` at the boundary.

```ts
export type EventSource = {
  list(): Promise<EventRow[]>;
  get(slug: string): Promise<EventRow | undefined>;
  upsert(row: ReturnType<typeof eventToRow>): Promise<EventRow>;
  update(slug: string, row: Partial<ReturnType<typeof eventToRow>>): Promise<EventRow | undefined>;
};

export function createEventRepository(source: EventSource) {
  return {
    async getEvents() {
      return (await source.list()).filter((row) => row.status === "published").map(rowToEvent);
    },
    async getAllEvents() {
      return (await source.list()).map(rowToEvent);
    },
    async getEvent(slug: string) {
      const row = await source.get(slug);
      return row?.status === "published" ? rowToEvent(row) : undefined;
    },
    async getEventAdmin(slug: string) {
      const row = await source.get(slug);
      return row ? rowToEvent(row) : undefined;
    },
    async createEvent(event: Event) {
      return rowToEvent(await source.upsert(eventToRow(event)));
    },
    async updateEvent(slug: string, data: Partial<Event>) {
      const current = await source.get(slug);
      if (!current) return undefined;
      return rowToEvent(await source.upsert(eventToRow({ ...rowToEvent(current), ...data })));
    },
  };
}
```

Wire the public-read default source to `createPublicSupabaseClient()` and
`.from("events")` with explicit `.select()` and `.eq("slug", slug)`. Wire
admin insert/update operations to the server-only admin client after admin
actions authorize the request, using `.upsert(...)` and Supabase error
handling. Never import the privileged client into a client component.

- [ ] **Step 5: Run repository tests to verify GREEN**

Run: `npm test -- src/lib/events/repository.test.ts`

Expected: PASS.

## Task 4: Async Public Event Reads and Registration Lookup

**Files:**
- Modify: `src/app/events/page.tsx`
- Modify: `src/app/events/[slug]/page.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/lib/registrations/actions.ts`
- Modify: any compiler-reported `getEvents`, `getEvent`, or `getAllEvents` call sites

- [ ] **Step 1: Use TypeScript/build output as the failing check**

Run: `npm run build`

Expected after Task 3: FAIL at synchronous event repository call sites that now
receive promises or client-only pages that cannot read server-side event data.

- [ ] **Step 2: Move public event pages to async server reads**

Keep language-sensitive interactive display in existing client components only
where needed. Convert route pages so repository reads happen on the server and
the resulting event list or event detail is passed into a render component if
the current `useLanguage` hook requires a client boundary.

Example route shape:

```ts
import { getEvents } from "@/lib/events/repository";
import { EventsView } from "@/components/events/events-view";

export default async function EventsPage() {
  return <EventsView events={await getEvents()} />;
}
```

- [ ] **Step 3: Await event lookup in registration action**

```ts
const event = await getEvent(eventSlug);
```

Preserve server-side availability and capacity checks.

- [ ] **Step 4: Run public integration checks**

Run: `npm test`

Expected: PASS.

Run: `npm run build`

Expected: PASS for async repository call sites.

## Task 5: Admin Event Mutations

**Files:**
- Create: `src/lib/events/actions.ts`
- Create or modify: `src/lib/events/actions.test.ts` if server action test patterns remain focused

- [ ] **Step 1: Write a failing action-focused test for publish validation**

Extract any pure action helper required to keep the test independent from Next
redirect/cookie machinery.

```ts
import { describe, expect, it } from "vitest";
import { publishEventResult } from "./actions";

describe("event admin action helpers", () => {
  it("returns missing fields instead of publishing incomplete events", async () => {
    const result = await publishEventResult({
      load: async () => ({ slug: "draft", title: { en: "", zh: "" } } as never),
      save: async () => {
        throw new Error("should not save");
      },
    }, "draft");

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run action test to verify RED**

Run: `npm test -- src/lib/events/actions.test.ts`

Expected: FAIL because event action helpers do not exist.

- [ ] **Step 3: Implement admin actions**

Server actions must call `requireAdmin()` before writes and revalidate routes
after successful writes.

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { createEvent, getEventAdmin, updateEvent } from "./repository";
import { validatePublishableEvent } from "./validation";

function revalidateEventPaths(slug: string) {
  revalidatePath("/events");
  revalidatePath(`/events/${slug}`);
  revalidatePath("/admin/events");
}
```

Implement:

- `createEventAction`
- `updateEventAction`
- `publishEventAction`
- `unpublishEventAction`
- `setRegistrationStateAction`

Return field-aware errors for validation failures so forms can render them.

- [ ] **Step 4: Run action tests to verify GREEN**

Run: `npm test -- src/lib/events/actions.test.ts`

Expected: PASS.

## Task 6: Full Admin Event Editor UI

**Files:**
- Create: `src/components/admin/event-editor-form.tsx`
- Modify: `src/app/admin/events/page.tsx`
- Create: `src/app/admin/events/new/page.tsx`
- Create: `src/app/admin/events/[slug]/edit/page.tsx`

- [ ] **Step 1: Treat route build as RED before UI routes exist**

Run: `npm run build`

Expected before creating admin editor routes: there is no new/create or edit
event surface satisfying the spec.

- [ ] **Step 2: Implement the shared editor form**

Build sections for:

- basic fields
- English content
- Chinese content
- registration window and field JSON/list controls
- SEO

Use regular inputs, textareas, selects, and list textarea parsing rather than a
rich text editor. Keep action error messages visible near the form and preserve
form values via action state or redirect only after a successful save.

- [ ] **Step 3: Add create and edit routes**

`/admin/events/new` should render an empty draft form with default registration
fields. `/admin/events/[slug]/edit` should load the admin event by slug and
render the populated form or a not-found state.

- [ ] **Step 4: Upgrade the admin event list**

Replace current browser-only in-memory toggle code with server-rendered event
rows and action-backed controls:

- New Event link
- Edit link
- Publish or Unpublish form action
- Open or Close Registration form action

- [ ] **Step 5: Run build verification**

Run: `npm run build`

Expected: PASS with admin create/edit routes compiled.

## Task 7: Seed Import and Workflow Documentation

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify if needed: `supabase/migrations/20260521231915_initial_schema.sql`

- [ ] **Step 1: Document the changed operational workflow**

Update README so it no longer says event repositories must simply be replaced
later. Document:

- required Supabase public URL/key configuration
- required server-only Supabase secret/service-role key for current password-backed admin writes
- existing events migration file path
- `events` admin editor route
- seed events as import/reference data
- activity update workflow through the admin UI

- [ ] **Step 2: Clarify environment comments**

Update `.env.example` comments so Supabase is clearly required for persisted
event admin operations and add a non-public `SUPABASE_SECRET_KEY` or
`SUPABASE_SERVICE_ROLE_KEY` sample entry for server-only admin writes.

- [ ] **Step 3: Confirm schema and docs agree**

Review the existing event columns and RLS policies in
`supabase/migrations/20260521231915_initial_schema.sql`. If implementation
requires an additional server-only write credential or RLS-safe write path,
document that requirement explicitly before verification.

## Task 8: Final Verification

**Files:**
- Verify all touched files

- [ ] **Step 1: Run event-focused tests**

Run:

```powershell
npm test -- src/lib/events/mappers.test.ts src/lib/events/validation.test.ts src/lib/events/repository.test.ts src/lib/events/actions.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 4: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Verify configured Supabase path**

In a configured Supabase environment, verify that a published event query
returns rows and that an authenticated admin save path can persist an event
draft. Do not claim Supabase persistence works without this configured check.
