# Modular Event Editor Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild SnowForce event creation around a normalized modular schema, a five-step admin editor, modular public event detail rendering, and modular registration questions.

**Architecture:** Events become aggregate records composed of an `events` core row, ordered `event_registration_questions`, and ordered `event_detail_modules`. Server actions remain the only admin write path after `requireAdmin()`, and public reads only expose published events. The admin UI manages a single event draft state with Chinese-first language switching, then submits the aggregate to the server action.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind, Supabase, Zod, Vitest.

---

## File Structure

- Modify `src/lib/types.ts`
  - Replace the wide event content fields with modular event aggregate types.
  - Add `EventRegistrationQuestion`, `EventDetailModule`, `EventQuestionType`, `EventDetailModuleType`, and `EventDetailDisplayMode`.
- Modify `supabase/migrations/20260521231915_initial_schema.sql`
  - Rebuild activity-related tables for a clean project state.
  - Create `events`, `event_registration_questions`, `event_detail_modules`, and a compatible `registrations`.
- Create `supabase/migrations/20260525090000_rebuild_modular_events.sql`
  - Destructive migration for linked environments that already applied the initial schema.
- Modify `src/lib/events/mappers.ts`
  - Map event core rows, question rows, and module rows to the new event aggregate.
- Modify `src/lib/events/mappers.test.ts`
  - Cover modular row parsing and aggregate write payloads.
- Modify `src/lib/events/repository.ts`
  - Load and save event aggregates.
  - Keep fake-source injection for tests.
- Modify `src/lib/events/repository.test.ts`
  - Cover public filtering, admin reads, registration counts, and aggregate replace-all writes.
- Modify `src/lib/events/validation.ts`
  - Parse the new editor payload and validate publish readiness.
- Modify `src/lib/events/validation.test.ts`
  - Cover draft parsing, module/question validation, and publish requirements.
- Modify `src/lib/events/actions.ts`
  - Submit the new aggregate payload, keep publish/archive/registration-state mutations, and refresh paths.
- Modify `src/lib/events/actions.test.ts`
  - Update publish/archive tests to use the new event shape.
- Modify `src/lib/registrations/validation.ts`
  - Validate answers against modular questions.
- Modify `src/lib/registrations/validation.test.ts`
  - Add modular answer validation tests.
- Modify `src/lib/registrations/actions.ts`
  - Use `event.registrationQuestions`.
- Modify `src/components/events/registration-form.tsx`
  - Render text, single choice, multiple choice, yes/no, date, and phone questions.
- Modify `src/components/events/event-detail-view.tsx`
  - Render ordered `event.detailModules` with language fallback.
- Modify `src/components/admin/event-editor-form.tsx`
  - Convert to an aggregate state container and submit hidden JSON payload.
- Create `src/components/admin/event-editor-stepper.tsx`
  - Vertical stepper and step summaries.
- Create `src/components/admin/event-basic-step.tsx`
  - Basic event fields.
- Create `src/components/admin/event-registration-settings-step.tsx`
  - Registration settings.
- Create `src/components/admin/event-question-builder.tsx`
  - Modular question cards.
- Create `src/components/admin/event-detail-module-builder.tsx`
  - Detail module cards.
- Create `src/components/admin/event-preview-panel.tsx`
  - Mobile-style preview and publish action area.
- Modify `src/app/admin/events/new/page.tsx`
  - Provide a new modular draft event.
- Modify `src/app/admin/events/[slug]/edit/page.tsx`
  - Continue loading the admin event aggregate.
- Modify `src/components/admin/admin-copy.ts`
  - Add bilingual labels for the new editor.
- Modify `src/lib/events/seed.ts`
  - Convert seed events to the new shape or reduce to a small modular seed set for local fallback/tests.

## Shared Test Fixture

Use this fixture shape across tests. Individual tasks may inline it or extract a local helper in the test file being changed.

```ts
import type { Event } from "@/lib/types";

export const modularEvent: Event = {
  slug: "big-bear-day",
  status: "draft",
  registrationState: "closed",
  title: { zh: "大熊山一日滑雪", en: "" },
  eventDate: "2026-12-12",
  meetTime: "07:30",
  meetLocation: { zh: "Rowland Heights 集合点", en: "" },
  activityLocation: { zh: "Big Bear Mountain Resort", en: "" },
  locationUrl: "https://maps.example.com/big-bear",
  coverImage: "/images/big-bear.jpg",
  capacity: 24,
  registrationCloseAt: "2026-12-10T18:00",
  requiresApproval: false,
  allowWaitlist: true,
  allowCancellation: true,
  feeAmount: "$120",
  paymentInstructions: { zh: "报名后通过微信群确认付款方式", en: "" },
  seoTitle: { zh: "", en: "" },
  seoDescription: { zh: "", en: "" },
  registrationCount: 0,
  registrationQuestions: [
    {
      id: "question-level",
      key: "level",
      type: "single_choice",
      required: true,
      label: { zh: "你的滑雪水平？", en: "" },
      helpText: { zh: "", en: "" },
      options: { zh: ["新手", "进阶", "高级"], en: [] },
    },
  ],
  detailModules: [
    {
      id: "module-intro",
      type: "intro",
      displayMode: "rich_text",
      title: { zh: "活动介绍", en: "" },
      content: { zh: "适合 SnowForce 社群的一日雪场活动。", en: "" },
      items: { zh: [], en: [] },
    },
  ],
};
```

### Task 1: Update Domain Types

**Files:**
- Modify: `src/lib/types.ts`
- Test: `src/lib/events/validation.test.ts`

- [ ] **Step 1: Write the failing type-facing validation test**

Add this test to `src/lib/events/validation.test.ts` before changing production types:

```ts
it("parses a modular editor payload into an event aggregate", () => {
  const result = parseEventEditorInput({
    slug: "big-bear-day",
    title: { zh: "大熊山一日滑雪", en: "" },
    eventDate: "2026-12-12",
    meetTime: "07:30",
    meetLocation: { zh: "Rowland Heights 集合点", en: "" },
    activityLocation: { zh: "Big Bear Mountain Resort", en: "" },
    capacity: "24",
    registrationCloseAt: "2026-12-10T18:00",
    registrationQuestions: [],
    detailModules: [
      {
        id: "module-intro",
        type: "intro",
        displayMode: "rich_text",
        title: { zh: "活动介绍", en: "" },
        content: { zh: "一日滑雪活动。", en: "" },
        items: { zh: [], en: [] },
      },
    ],
  });

  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.data).toMatchObject({
    slug: "big-bear-day",
    title: { zh: "大熊山一日滑雪", en: "" },
    eventDate: "2026-12-12",
    meetTime: "07:30",
    registrationQuestions: [],
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm test -- src/lib/events/validation.test.ts
```

Expected: FAIL because `parseEventEditorInput` still expects the old wide event shape or returned data does not include modular fields.

- [ ] **Step 3: Update `src/lib/types.ts`**

Replace the old event content and registration field types with this shape:

```ts
export type Bilingual<T = string> = { en: T; zh: T };

export type EventStatus = "draft" | "published" | "archived";
export type RegistrationState = "open" | "closed" | "full";
export type EventQuestionType =
  | "text"
  | "single_choice"
  | "multiple_choice"
  | "yes_no"
  | "date"
  | "phone";
export type EventDetailModuleType =
  | "intro"
  | "highlights"
  | "itinerary"
  | "notes"
  | "fees"
  | "refund"
  | "contact"
  | "custom";
export type EventDetailDisplayMode = "rich_text" | "list";

export interface EventRegistrationQuestion {
  id: string;
  key: string;
  type: EventQuestionType;
  required: boolean;
  label: Bilingual;
  helpText: Bilingual;
  options: Bilingual<string[]>;
}

export interface EventDetailModule {
  id: string;
  type: EventDetailModuleType;
  displayMode: EventDetailDisplayMode;
  title: Bilingual;
  content: Bilingual;
  items: Bilingual<string[]>;
}

export interface Event {
  slug: string;
  status: EventStatus;
  registrationState: RegistrationState;
  title: Bilingual;
  eventDate: string;
  meetTime: string;
  meetLocation: Bilingual;
  activityLocation: Bilingual;
  locationUrl: string;
  coverImage: string;
  capacity: number;
  registrationCount: number;
  registrationCloseAt: string;
  requiresApproval: boolean;
  allowWaitlist: boolean;
  allowCancellation: boolean;
  feeAmount: string;
  paymentInstructions: Bilingual;
  seoTitle: Bilingual;
  seoDescription: Bilingual;
  registrationQuestions: EventRegistrationQuestion[];
  detailModules: EventDetailModule[];
}
```

Keep the existing `Registration`, `MemberProfile`, `EventRecap`, `FAQItem`, `PartnerInquiry`, and `StaffUser` interfaces, updating only event-related references that still point to `RegistrationFieldConfig`.

- [ ] **Step 4: Run the test again**

Run:

```bash
npm test -- src/lib/events/validation.test.ts
```

Expected: still FAIL until Task 4 updates validation. That is acceptable at this task boundary.

### Task 2: Rebuild Supabase Activity Schema

**Files:**
- Modify: `supabase/migrations/20260521231915_initial_schema.sql`
- Create: `supabase/migrations/20260525090000_rebuild_modular_events.sql`

- [ ] **Step 1: Add the destructive migration file**

Create `supabase/migrations/20260525090000_rebuild_modular_events.sql` with:

```sql
-- Rebuild SnowForce activity schema for modular event creation.
-- This migration is destructive by design because the project has no historical event data.

drop table if exists registrations cascade;
drop table if exists event_registration_questions cascade;
drop table if exists event_detail_modules cascade;
drop table if exists events cascade;

create table events (
  slug text primary key,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  registration_state text not null default 'closed' check (registration_state in ('open', 'closed', 'full')),
  title_zh text not null default '',
  title_en text not null default '',
  event_date date,
  meet_time time,
  meet_location_zh text not null default '',
  meet_location_en text not null default '',
  activity_location_zh text not null default '',
  activity_location_en text not null default '',
  location_url text not null default '',
  cover_image text not null default '',
  capacity integer not null default 0 check (capacity >= 0),
  registration_close_at timestamptz,
  requires_approval boolean not null default false,
  allow_waitlist boolean not null default false,
  allow_cancellation boolean not null default true,
  fee_amount text not null default '',
  payment_instructions_zh text not null default '',
  payment_instructions_en text not null default '',
  seo_title_zh text not null default '',
  seo_title_en text not null default '',
  seo_description_zh text not null default '',
  seo_description_en text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table event_registration_questions (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null references events(slug) on delete cascade,
  question_key text not null,
  type text not null check (type in ('text', 'single_choice', 'multiple_choice', 'yes_no', 'date', 'phone')),
  required boolean not null default false,
  sort_order integer not null default 0,
  label_zh text not null default '',
  label_en text not null default '',
  help_zh text not null default '',
  help_en text not null default '',
  options_zh jsonb not null default '[]',
  options_en jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_slug, question_key)
);

create table event_detail_modules (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null references events(slug) on delete cascade,
  module_type text not null check (module_type in ('intro', 'highlights', 'itinerary', 'notes', 'fees', 'refund', 'contact', 'custom')),
  display_mode text not null default 'rich_text' check (display_mode in ('rich_text', 'list')),
  sort_order integer not null default 0,
  title_zh text not null default '',
  title_en text not null default '',
  content_zh text not null default '',
  content_en text not null default '',
  items_zh jsonb not null default '[]',
  items_en jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table registrations (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null references events(slug) on delete cascade,
  member_id uuid references member_profiles(id),
  answers jsonb not null default '{}',
  consent_given boolean not null default false,
  contact_email text not null,
  contact_name text not null,
  contact_phone text,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'waitlist')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_event_registration_questions_event on event_registration_questions(event_slug, sort_order);
create index idx_event_detail_modules_event on event_detail_modules(event_slug, sort_order);
create index idx_registrations_event on registrations(event_slug);
create index idx_registrations_member on registrations(member_id);
create index idx_registrations_status on registrations(status);

alter table events enable row level security;
alter table event_registration_questions enable row level security;
alter table event_detail_modules enable row level security;
alter table registrations enable row level security;

create policy "Public can read published events" on events
  for select using (status = 'published');

create policy "Public can read published event questions" on event_registration_questions
  for select using (exists (
    select 1 from events where events.slug = event_registration_questions.event_slug and events.status = 'published'
  ));

create policy "Public can read published event modules" on event_detail_modules
  for select using (exists (
    select 1 from events where events.slug = event_detail_modules.event_slug and events.status = 'published'
  ));

create policy "Members can read own registrations" on registrations
  for select using (member_id in (select id from member_profiles where user_id = auth.uid()));

create policy "Staff can manage events" on events
  for all using (exists (select 1 from staff_roles where user_id = auth.uid()));
create policy "Staff can manage event questions" on event_registration_questions
  for all using (exists (select 1 from staff_roles where user_id = auth.uid()));
create policy "Staff can manage event modules" on event_detail_modules
  for all using (exists (select 1 from staff_roles where user_id = auth.uid()));
create policy "Staff can manage registrations" on registrations
  for all using (exists (select 1 from staff_roles where user_id = auth.uid()));

create trigger set_updated_at before update on events for each row execute function update_updated_at();
create trigger set_updated_at before update on event_registration_questions for each row execute function update_updated_at();
create trigger set_updated_at before update on event_detail_modules for each row execute function update_updated_at();
create trigger set_updated_at before update on registrations for each row execute function update_updated_at();
```

- [ ] **Step 2: Mirror the new activity schema in the initial migration**

In `supabase/migrations/20260521231915_initial_schema.sql`, replace only the existing Events and Registrations sections with the same `events`, `event_registration_questions`, `event_detail_modules`, and `registrations` definitions above. Preserve member profiles, recaps, FAQ, inquiries, media, staff roles, policies for non-event tables, and the `update_updated_at()` function.

- [ ] **Step 3: Validate SQL shape by inspection**

Run:

```bash
rg -n "event_registration_questions|event_detail_modules|registration_fields|description_en|highlights_en" supabase/migrations
```

Expected: `event_registration_questions` and `event_detail_modules` appear; old wide event columns such as `registration_fields`, `description_en`, and `highlights_en` no longer appear in activity schema definitions.

### Task 3: Modular Mappers

**Files:**
- Modify: `src/lib/events/mappers.ts`
- Modify: `src/lib/events/mappers.test.ts`

- [ ] **Step 1: Write failing mapper tests**

Replace `src/lib/events/mappers.test.ts` with tests for aggregate row mapping:

```ts
import { describe, expect, it } from "vitest";
import {
  eventAggregateToWriteRows,
  rowsToEvent,
  type EventCoreRow,
  type EventDetailModuleRow,
  type EventRegistrationQuestionRow,
} from "./mappers";

const core: EventCoreRow = {
  slug: "big-bear-day",
  status: "published",
  registration_state: "open",
  title_zh: "大熊山一日滑雪",
  title_en: "",
  event_date: "2026-12-12",
  meet_time: "07:30:00",
  meet_location_zh: "Rowland Heights",
  meet_location_en: "",
  activity_location_zh: "Big Bear",
  activity_location_en: "",
  location_url: "",
  cover_image: "",
  capacity: 24,
  registration_close_at: "2026-12-10T18:00:00+00:00",
  requires_approval: false,
  allow_waitlist: true,
  allow_cancellation: true,
  fee_amount: "$120",
  payment_instructions_zh: "微信群确认付款",
  payment_instructions_en: "",
  seo_title_zh: "",
  seo_title_en: "",
  seo_description_zh: "",
  seo_description_en: "",
};

const question: EventRegistrationQuestionRow = {
  id: "question-level",
  event_slug: "big-bear-day",
  question_key: "level",
  type: "single_choice",
  required: true,
  sort_order: 0,
  label_zh: "你的滑雪水平？",
  label_en: "",
  help_zh: "",
  help_en: "",
  options_zh: ["新手", "进阶"],
  options_en: [],
};

const moduleRow: EventDetailModuleRow = {
  id: "module-intro",
  event_slug: "big-bear-day",
  module_type: "intro",
  display_mode: "rich_text",
  sort_order: 0,
  title_zh: "活动介绍",
  title_en: "",
  content_zh: "一日活动",
  content_en: "",
  items_zh: [],
  items_en: [],
};

describe("modular event mappers", () => {
  it("maps rows into an event aggregate", () => {
    expect(rowsToEvent(core, [question], [moduleRow])).toMatchObject({
      slug: "big-bear-day",
      registrationQuestions: [{ key: "level", type: "single_choice" }],
      detailModules: [{ id: "module-intro", type: "intro" }],
    });
  });

  it("maps an event aggregate into core, question, and module write rows", () => {
    const event = rowsToEvent(core, [question], [moduleRow]);
    const rows = eventAggregateToWriteRows(event);

    expect(rows.core.slug).toBe("big-bear-day");
    expect(rows.questions[0]).toMatchObject({ question_key: "level", sort_order: 0 });
    expect(rows.modules[0]).toMatchObject({ module_type: "intro", sort_order: 0 });
  });
});
```

- [ ] **Step 2: Run mapper tests and verify failure**

Run:

```bash
npm test -- src/lib/events/mappers.test.ts
```

Expected: FAIL because the mapper exports still use the old wide event row.

- [ ] **Step 3: Implement mapper types and functions**

In `src/lib/events/mappers.ts`, define:

```ts
import type {
  Event,
  EventDetailDisplayMode,
  EventDetailModuleType,
  EventQuestionType,
} from "@/lib/types";

export type EventCoreRow = {
  slug: string;
  status: Event["status"];
  registration_state: Event["registrationState"];
  title_zh: string;
  title_en: string;
  event_date: string | null;
  meet_time: string | null;
  meet_location_zh: string;
  meet_location_en: string;
  activity_location_zh: string;
  activity_location_en: string;
  location_url: string;
  cover_image: string;
  capacity: number;
  registration_close_at: string | null;
  requires_approval: boolean;
  allow_waitlist: boolean;
  allow_cancellation: boolean;
  fee_amount: string;
  payment_instructions_zh: string;
  payment_instructions_en: string;
  seo_title_zh: string;
  seo_title_en: string;
  seo_description_zh: string;
  seo_description_en: string;
};

export type EventRegistrationQuestionRow = {
  id: string;
  event_slug: string;
  question_key: string;
  type: EventQuestionType;
  required: boolean;
  sort_order: number;
  label_zh: string;
  label_en: string;
  help_zh: string;
  help_en: string;
  options_zh: unknown;
  options_en: unknown;
};

export type EventDetailModuleRow = {
  id: string;
  event_slug: string;
  module_type: EventDetailModuleType;
  display_mode: EventDetailDisplayMode;
  sort_order: number;
  title_zh: string;
  title_en: string;
  content_zh: string;
  content_en: string;
  items_zh: unknown;
  items_en: unknown;
};
```

Implement helpers:

```ts
function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

function timeValue(value: string | null) {
  return value ? value.slice(0, 5) : "";
}

function nullableDate(value: string) {
  return value || null;
}
```

Implement `rowsToEvent(core, questions, modules)` and `eventAggregateToWriteRows(event)` to match the failing tests. Ensure `registrationCount` defaults to `0`.

- [ ] **Step 4: Run mapper tests and verify pass**

Run:

```bash
npm test -- src/lib/events/mappers.test.ts
```

Expected: PASS.

### Task 4: Event Editor Validation

**Files:**
- Modify: `src/lib/events/validation.ts`
- Modify: `src/lib/events/validation.test.ts`

- [ ] **Step 1: Replace validation tests with modular cases**

Keep the test added in Task 1 and add:

```ts
it("rejects choice questions without Chinese options before parsing succeeds", () => {
  const result = parseEventEditorInput({
    slug: "big-bear-day",
    title: { zh: "大熊山一日滑雪", en: "" },
    capacity: "24",
    registrationQuestions: [
      {
        id: "q1",
        key: "level",
        type: "single_choice",
        required: true,
        label: { zh: "水平", en: "" },
        helpText: { zh: "", en: "" },
        options: { zh: [], en: [] },
      },
    ],
    detailModules: [],
  });

  expect(result.success).toBe(false);
});

it("requires core Chinese content and one meaningful detail module before publishing", () => {
  const result = parseEventEditorInput({
    slug: "big-bear-day",
    title: { zh: "", en: "" },
    eventDate: "",
    meetTime: "",
    activityLocation: { zh: "", en: "" },
    capacity: "0",
    registrationQuestions: [],
    detailModules: [],
  });

  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(validatePublishableEvent(result.data)).toEqual(
    expect.arrayContaining(["title.zh", "eventDate", "meetTime", "activityLocation.zh", "detailModules"]),
  );
});
```

- [ ] **Step 2: Run validation tests and verify failure**

Run:

```bash
npm test -- src/lib/events/validation.test.ts
```

Expected: FAIL because modular validation is not implemented.

- [ ] **Step 3: Implement modular Zod schemas**

In `src/lib/events/validation.ts`, define:

```ts
const bilingualText = z.object({
  en: z.string().default(""),
  zh: z.string().default(""),
});

const bilingualList = z.object({
  en: z.array(z.string()).default([]),
  zh: z.array(z.string()).default([]),
});

const questionSchema = z.object({
  id: z.string().trim().min(1),
  key: z.string().trim().min(1).regex(/^[a-z][a-z0-9_]*$/),
  type: z.enum(["text", "single_choice", "multiple_choice", "yes_no", "date", "phone"]),
  required: z.boolean().default(false),
  label: bilingualText,
  helpText: bilingualText.default({ en: "", zh: "" }),
  options: bilingualList.default({ en: [], zh: [] }),
}).superRefine((question, ctx) => {
  if ((question.type === "single_choice" || question.type === "multiple_choice") && question.options.zh.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options", "zh"], message: "Choice questions need Chinese options." });
  }
});

const moduleSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(["intro", "highlights", "itinerary", "notes", "fees", "refund", "contact", "custom"]),
  displayMode: z.enum(["rich_text", "list"]).default("rich_text"),
  title: bilingualText,
  content: bilingualText.default({ en: "", zh: "" }),
  items: bilingualList.default({ en: [], zh: [] }),
});
```

Build `editorSchema` around the new `Event` fields. Use `z.coerce.number().int().min(0)` for capacity and default booleans for registration settings. Keep status and registration state enums.

Implement `validatePublishableEvent(event)` with these missing field names:

```ts
const requiredFields: Array<[string, unknown]> = [
  ["title.zh", event.title.zh],
  ["eventDate", event.eventDate],
  ["meetTime", event.meetTime],
  ["activityLocation.zh", event.activityLocation.zh],
];
```

Add `"detailModules"` when no module has either `content.zh.trim()` or `items.zh.length`.

- [ ] **Step 4: Run validation tests and verify pass**

Run:

```bash
npm test -- src/lib/events/validation.test.ts
```

Expected: PASS.

### Task 5: Repository Aggregate Reads and Writes

**Files:**
- Modify: `src/lib/events/repository.ts`
- Modify: `src/lib/events/repository.test.ts`

- [ ] **Step 1: Write failing repository tests**

Update `EventSource` test fake expectations so the repository can load related rows:

```ts
it("loads questions and modules into public event aggregates", async () => {
  const repository = createEventRepository(
    eventSource({
      events: [eventCoreRow("published", "published")],
      questions: [questionRow("published")],
      modules: [moduleRow("published")],
    }),
  );

  const event = await repository.getEvent("published");

  expect(event?.registrationQuestions).toHaveLength(1);
  expect(event?.detailModules).toHaveLength(1);
});

it("replaces questions and modules when saving an event aggregate", async () => {
  const source = eventSource({ events: [eventCoreRow("draft", "draft")], questions: [], modules: [] });
  const repository = createEventRepository(source);

  await repository.createEvent({
    ...rowsToEvent(eventCoreRow("draft", "draft"), [], []),
    registrationQuestions: [eventQuestion("level")],
    detailModules: [eventModule("intro")],
  });

  expect(source.savedQuestions.map((row) => row.question_key)).toEqual(["level"]);
  expect(source.savedModules.map((row) => row.module_type)).toEqual(["intro"]);
});
```

Define `eventCoreRow`, `questionRow`, `moduleRow`, `eventQuestion`, `eventModule`, and a fake `eventSource` in the test file using the mapper row types.

- [ ] **Step 2: Run repository tests and verify failure**

Run:

```bash
npm test -- src/lib/events/repository.test.ts
```

Expected: FAIL because `EventSource` lacks modular methods.

- [ ] **Step 3: Update repository source interface**

In `src/lib/events/repository.ts`, change `EventSource` to:

```ts
export type EventSource = {
  listPublicEvents(): Promise<EventCoreRow[]>;
  listAdminEvents(): Promise<EventCoreRow[]>;
  getPublicEvent(slug: string): Promise<EventCoreRow | undefined>;
  getAdminEvent(slug: string): Promise<EventCoreRow | undefined>;
  listQuestions(slugs: string[]): Promise<EventRegistrationQuestionRow[]>;
  listModules(slugs: string[]): Promise<EventDetailModuleRow[]>;
  saveAggregate(rows: EventAggregateWriteRows): Promise<EventCoreRow>;
};
```

Use `rowsToEvent` to combine core rows with related rows grouped by `event_slug`. Continue applying registration counts after aggregate mapping.

- [ ] **Step 4: Implement Supabase source methods**

Use three tables:

- `events`
- `event_registration_questions`
- `event_detail_modules`

For `saveAggregate`, use service-role Supabase client:

```ts
await client.from("events").upsert(rows.core);
await client.from("event_registration_questions").delete().eq("event_slug", rows.core.slug);
await client.from("event_detail_modules").delete().eq("event_slug", rows.core.slug);
if (rows.questions.length) await client.from("event_registration_questions").insert(rows.questions);
if (rows.modules.length) await client.from("event_detail_modules").insert(rows.modules);
```

Then select and return the saved core row.

- [ ] **Step 5: Run repository tests and verify pass**

Run:

```bash
npm test -- src/lib/events/repository.test.ts
```

Expected: PASS.

### Task 6: Event Actions and Draft Payload Parsing

**Files:**
- Modify: `src/lib/events/actions.ts`
- Modify: `src/lib/events/actions.test.ts`

- [ ] **Step 1: Write failing action tests**

Update tests so `publishEventResult` checks new required fields:

```ts
it("blocks publishing modular events without required public content", async () => {
  const event = {
    ...modularEvent,
    title: { zh: "", en: "" },
    detailModules: [],
  };

  const result = await publishEventResult({
    load: async () => event,
    save: async () => event,
  }, event.slug);

  expect(result).toMatchObject({
    success: false,
    missingFields: expect.arrayContaining(["title.zh", "detailModules"]),
  });
});
```

- [ ] **Step 2: Run action tests and verify failure**

Run:

```bash
npm test -- src/lib/events/actions.test.ts
```

Expected: FAIL until actions use the new event shape.

- [ ] **Step 3: Update `editorInput`**

In `src/lib/events/actions.ts`, simplify form parsing to support a JSON payload:

```ts
function readEditorPayload(formData: FormData) {
  const raw = formText(formData, "eventPayload");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { __invalidPayload: true };
  }
}
```

Use `parseEventEditorInput(readEditorPayload(formData))` in `saveEventAction`.

- [ ] **Step 4: Keep publish/archive behavior**

Ensure:

- `publishEventResult` calls updated `validatePublishableEvent`.
- `archiveEventResult` sets `{ status: "archived", registrationState: "closed" }`.
- `setRegistrationStateAction` still accepts only `open`, `closed`, `full`.

- [ ] **Step 5: Run action tests**

Run:

```bash
npm test -- src/lib/events/actions.test.ts
```

Expected: PASS after test fixtures use modular events.

### Task 7: Modular Registration Validation and Action

**Files:**
- Modify: `src/lib/registrations/validation.ts`
- Create or modify: `src/lib/registrations/validation.test.ts`
- Modify: `src/lib/registrations/actions.ts`

- [ ] **Step 1: Write failing registration validation tests**

Create `src/lib/registrations/validation.test.ts` if it does not exist:

```ts
import { describe, expect, it } from "vitest";
import { validateRegistrationAnswers } from "./validation";
import type { EventRegistrationQuestion } from "@/lib/types";

const questions: EventRegistrationQuestion[] = [
  {
    id: "q-level",
    key: "level",
    type: "single_choice",
    required: true,
    label: { zh: "水平", en: "" },
    helpText: { zh: "", en: "" },
    options: { zh: ["新手", "进阶"], en: [] },
  },
  {
    id: "q-pass",
    key: "pass",
    type: "multiple_choice",
    required: false,
    label: { zh: "雪票", en: "" },
    helpText: { zh: "", en: "" },
    options: { zh: ["Ikon", "Epic"], en: [] },
  },
];

describe("registration answer validation", () => {
  it("accepts valid modular answers", () => {
    expect(validateRegistrationAnswers(questions, { level: "新手", pass: ["Ikon"] }).success).toBe(true);
  });

  it("rejects missing required answers and invalid choices", () => {
    const result = validateRegistrationAnswers(questions, { level: "其他" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run validation tests and verify failure**

Run:

```bash
npm test -- src/lib/registrations/validation.test.ts
```

Expected: FAIL because `validateRegistrationAnswers` does not exist.

- [ ] **Step 3: Implement `validateRegistrationAnswers`**

In `src/lib/registrations/validation.ts`, replace the old `RegistrationFieldConfig` schema builder with:

```ts
import type { EventRegistrationQuestion } from "@/lib/types";

export type RegistrationAnswerValue = string | boolean | string[];
export type RegistrationAnswers = Record<string, RegistrationAnswerValue>;

export function validateRegistrationAnswers(
  questions: EventRegistrationQuestion[],
  answers: RegistrationAnswers,
) {
  const errors: Record<string, string> = {};

  for (const question of questions) {
    const value = answers[question.key];
    const missing =
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0);

    if (question.required && missing) {
      errors[question.key] = `${question.key} is required`;
      continue;
    }

    if (missing) continue;

    const options = question.options.zh;
    if (question.type === "single_choice" && typeof value === "string" && !options.includes(value)) {
      errors[question.key] = `${question.key} is invalid`;
    }
    if (question.type === "multiple_choice") {
      if (!Array.isArray(value) || value.some((item) => !options.includes(item))) {
        errors[question.key] = `${question.key} is invalid`;
      }
    }
    if (question.type === "phone" && typeof value === "string" && value.trim().length < 5) {
      errors[question.key] = `${question.key} is invalid`;
    }
  }

  return Object.keys(errors).length
    ? { success: false as const, errors }
    : { success: true as const, data: answers };
}
```

- [ ] **Step 4: Update `registerForEvent`**

In `src/lib/registrations/actions.ts`:

- Change `answers` input type to `Record<string, string | boolean | string[]>`.
- Validate with `validateRegistrationAnswers(event.registrationQuestions, input.answers)`.
- Derive contact fields from `name`, `email`, and `phone` answers only when they are strings.
- Use `event.title.zh || event.title.en` for Chinese email title and `event.title.en || event.title.zh` for English.
- Use `event.eventDate` for the confirmation date.

- [ ] **Step 5: Run registration tests**

Run:

```bash
npm test -- src/lib/registrations/validation.test.ts src/lib/registrations/actions.test.ts
```

Expected: validation tests PASS. If no `actions.test.ts` exists, run only the validation test.

### Task 8: Public Registration Form

**Files:**
- Modify: `src/components/events/registration-form.tsx`

- [ ] **Step 1: Update form state type**

Use:

```ts
type AnswerValue = string | boolean | string[];
type FormDataState = Record<string, AnswerValue>;
```

- [ ] **Step 2: Replace old field renderer**

Render from `event.registrationQuestions`. Map:

- `text` -> text input
- `phone` -> tel input
- `date` -> date input
- `yes_no` -> select or segmented yes/no controls
- `single_choice` -> select
- `multiple_choice` -> checkbox group

Use language fallback:

```ts
function localizedText(value: { en: string; zh: string }, lang: "en" | "zh") {
  return lang === "en" ? value.en || value.zh : value.zh || value.en;
}
```

- [ ] **Step 3: Update client validation**

Client validation should mirror required checks and obvious choice checks, but server validation remains authoritative.

- [ ] **Step 4: Defer TypeScript verification to Task 13**

No isolated component test is required here unless the project already has a component test harness. Verification happens in Task 13.

### Task 9: Public Event Detail Modules

**Files:**
- Modify: `src/components/events/event-detail-view.tsx`
- Modify: `src/lib/events/availability.ts`
- Modify: `src/lib/events/availability.test.ts`

- [ ] **Step 1: Write failing availability tests for new date fields**

Update `availability.test.ts` so event fixtures use `eventDate`, `meetTime`, and `registrationCloseAt`. Expected behavior remains:

- closed state is not open
- full state is not open
- capacity `0` is unlimited

- [ ] **Step 2: Update availability helpers**

In `src/lib/events/availability.ts`, remove dependence on `eventStartAt/eventEndAt/registrationOpenAt`. Use:

- `event.registrationState === "open"`
- `event.status === "published"`
- `registrationCloseAt` if present and still in the future
- capacity checks using `capacity` and `registrationCount`

- [ ] **Step 3: Update detail rendering**

In `event-detail-view.tsx`:

- Use `event.activityLocation` for location.
- Use `event.eventDate` and `event.meetTime` for date/time display.
- Replace hard-coded description/highlights/schedule/notices sections with:

```tsx
{event.detailModules.map((module) => (
  <ContentSection key={module.id} title={localizedText(module.title, lang)}>
    {module.displayMode === "list" ? (
      <ul className="space-y-3">
        {localizedList(module.items, lang).map((item) => (
          <li key={item} className="flex gap-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#0066cc]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    ) : (
      <div className="whitespace-pre-line">{localizedText(module.content, lang)}</div>
    )}
  </ContentSection>
))}
```

- [ ] **Step 4: Run availability tests**

Run:

```bash
npm test -- src/lib/events/availability.test.ts
```

Expected: PASS.

### Task 10: Admin Editor State Container

**Files:**
- Modify: `src/app/admin/events/new/page.tsx`
- Modify: `src/components/admin/event-editor-form.tsx`
- Modify: `src/components/admin/admin-copy.ts`

- [ ] **Step 1: Create a modular draft event**

In `new/page.tsx`, replace the old wide draft with the new `Event` shape from the shared fixture. Use empty strings/defaults and empty arrays for questions/modules.

- [ ] **Step 2: Convert form submission to JSON payload**

In `event-editor-form.tsx`, keep `useFormState(saveEventAction, initialState)`, maintain `draftEvent` in React state, and submit:

```tsx
<input type="hidden" name="eventPayload" value={JSON.stringify(draftEvent)} />
```

Use a normal submit button for save draft.

- [ ] **Step 3: Add active language state**

Use:

```ts
const [activeLang, setActiveLang] = useState<"zh" | "en">("zh");
```

Render two compact buttons: `中文` and `English`. Do not render side-by-side language panels.

- [ ] **Step 4: Add admin copy keys**

Add labels to `admin-copy.ts` for:

- Basic info
- Registration settings
- Participant questions
- Event detail modules
- Preview and publish
- Add question
- Add module
- Copy
- Move up
- Move down
- Collapse
- Expand

- [ ] **Step 5: Run admin copy tests**

Run:

```bash
npm test -- src/components/admin/admin-copy.test.ts
```

Expected: PASS after updating expected copy coverage.

### Task 11: Admin Step Components

**Files:**
- Create: `src/components/admin/event-editor-stepper.tsx`
- Create: `src/components/admin/event-basic-step.tsx`
- Create: `src/components/admin/event-registration-settings-step.tsx`
- Create: `src/components/admin/event-question-builder.tsx`
- Create: `src/components/admin/event-detail-module-builder.tsx`
- Create: `src/components/admin/event-preview-panel.tsx`
- Modify: `src/components/admin/event-editor-form.tsx`

- [ ] **Step 1: Create `event-editor-stepper.tsx`**

Props:

```ts
type StepId = "basic" | "registration" | "questions" | "modules" | "preview";

type EventEditorStepperProps = {
  activeStep: StepId;
  onStepChange(step: StepId): void;
  summaries: Record<StepId, string>;
};
```

Render a vertical list of buttons. Active button uses blue border/background. Summaries appear under non-active labels.

- [ ] **Step 2: Create `event-basic-step.tsx`**

Props:

```ts
type EventBasicStepProps = {
  event: Event;
  activeLang: "zh" | "en";
  onChange(event: Event): void;
};
```

Render title, date, meet time, meet location, activity location, map URL, cover image, status, and registration state. Update bilingual fields using `activeLang`.

- [ ] **Step 3: Create `event-registration-settings-step.tsx`**

Render capacity, registration close time, requires approval, allow waitlist, allow cancellation, fee amount, and payment instructions.

- [ ] **Step 4: Create `event-question-builder.tsx`**

Render question cards with add, copy, delete, expand/collapse, move up, and move down. Generate new question keys from type plus timestamp:

```ts
const key = `${type}_${Date.now()}`;
```

Then normalize to lowercase alphanumeric/underscore before save.

- [ ] **Step 5: Create `event-detail-module-builder.tsx`**

Render module cards with add, copy, delete, expand/collapse, move up, and move down. Provide module type presets for all eight module types. List mode edits newline-separated items; rich text mode edits textarea content.

- [ ] **Step 6: Create `event-preview-panel.tsx`**

Render a compact phone-style preview:

- Title
- Date/time
- Location
- Capacity
- Module titles
- Buttons for save draft and publish are still owned by the parent form.

- [ ] **Step 7: Wire components into `event-editor-form.tsx`**

Use one active step at a time. On desktop use a two-column layout:

- Left: stepper
- Middle: active step
- Right: preview/action panel

On mobile stack them.

### Task 12: Seeds and Admin Pages

**Files:**
- Modify: `src/lib/events/seed.ts`
- Modify: `src/app/admin/events/[slug]/edit/page.tsx`
- Modify: `src/components/admin/admin-events-view.tsx`
- Modify: `src/components/admin/event-editor-heading.tsx`
- Modify: `src/lib/recaps/actions.ts`

- [ ] **Step 1: Convert seed events**

Replace old seed fields with new modular fields. Keep at least one published event and one draft event.

- [ ] **Step 2: Update admin list display**

Use:

- `event.title`
- `event.eventDate`
- `event.activityLocation`
- `event.capacity`
- `event.registrationCount`
- `event.status`
- `event.registrationState`

- [ ] **Step 3: Update heading/edit pages**

Ensure heading and edit page no longer reference removed fields.

- [ ] **Step 4: Update recap creation from archived events**

In `src/lib/recaps/actions.ts`, map recap fields from:

- `event.title`
- `event.eventDate`
- `event.activityLocation`
- first intro module content as summary/content when available
- `event.coverImage`

### Task 13: Full Verification and Build Fixes

**Files:**
- Any files touched by previous tasks.

- [ ] **Step 1: Run targeted test suite**

Run:

```bash
npm test -- src/lib/events/validation.test.ts src/lib/events/mappers.test.ts src/lib/events/repository.test.ts src/lib/events/actions.test.ts src/lib/events/availability.test.ts src/lib/registrations/validation.test.ts src/components/admin/admin-copy.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS. If the build exposes type errors from old event fields, update the referenced component/repository to the new event shape and rerun.

- [ ] **Step 4: Run local dev server for UI verification**

Before starting, inspect existing Node/Next processes. Stop only project Next dev processes that are clearly writing this workspace’s `.next`.

Run:

```bash
npm run dev
```

Expected: Next starts and prints a local URL.

- [ ] **Step 5: Browser smoke test**

Open the dev URL and verify:

- `/admin/events/new` shows the five-step editor.
- Chinese is the default editing language.
- English switch changes editable bilingual fields without side-by-side panels.
- Adding a question creates a collapsible card.
- Adding a detail module creates a collapsible card.
- Save draft submits without requiring every publish field.
- Public event detail renders module sections for a published seed/Supabase event.

- [ ] **Step 6: Final status**

Collect:

- Tests run and results.
- Build result.
- Any remaining limitations, especially disabled copy/share actions or Supabase migration not pushed.
