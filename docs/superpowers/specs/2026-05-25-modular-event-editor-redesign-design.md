# Modular Event Editor Redesign Design

## Summary

SnowForce will replace the current all-at-once bilingual event form with a modular event creation flow inspired by WeChat mini-program activity sign-up tools. The new admin experience will use a vertical stepper and optional content modules so staff can create an event progressively instead of facing every English and Chinese field at once.

Because SnowForce is still a new project and there is no historical production event data to preserve, this design intentionally rebuilds the activity database model instead of adapting the old wide `events` table. The new model separates event basics, registration questions, and detail modules. Public event detail pages will render from the same modular model so the new creation flow has a complete public-facing path.

## Goals

- Replace the current dense `EventEditorForm` with a lightweight step-by-step editor.
- Let staff add participant questions only when needed.
- Let staff add event detail modules only when needed.
- Support expanding, collapsing, copying, deleting, and sorting questions/modules.
- Default editing to Chinese and let staff switch to English without showing two full language panels at once.
- Use Chinese content as the public fallback when English fields are empty.
- Rebuild activity-related tables around the modular creation model.
- Update public event detail rendering to consume ordered detail modules.
- Preserve the current local staff admin session model and server-action write path.

## Non-Goals

- Supabase Storage upload UI. Cover images and media remain URL/path strings in this increment.
- A production rich text editor dependency. Rich text mode may use a textarea/markdown-like field in the first implementation.
- Drag-and-drop sorting in the first implementation. The UI should expose up/down sorting controls and keep the data model ready for future drag-and-drop.
- AI translation or real automatic English generation. The first version will not include an "automatic English" button.
- Preserving old `events` table data. The migration can be destructive because the project has no historical data to keep.
- Reworking staff auth from the current local password cookie to Supabase staff auth.

## Chosen Approach

Use a normalized modular schema:

- `events` stores the core event record, status, times, locations, cover, capacity, and registration settings.
- `event_registration_questions` stores ordered configurable participant questions.
- `event_detail_modules` stores ordered configurable public detail sections.
- `registrations.answers` stores submitted answers keyed by registration question key.

The admin editor uses a mobile-first vertical stepper:

1. Basic info
2. Registration settings
3. Participant questions
4. Event detail modules
5. Preview and publish

Each step is a focused panel. Completed steps collapse into a short summary. On desktop, a right-side or bottom sticky action area can show mobile preview, save draft, publish, copy, share link, and view registrations actions. On mobile, those actions collapse into a sticky bottom bar.

## User Experience

### Step 1: Basic Info

Fields:

- Event title
- Event date
- Meet time
- Meet location
- Activity location
- Cover image URL/path
- Event status: draft, registration open, full, ended

Implementation notes:

- Keep the form compact and linear.
- Status selection should map cleanly to the internal event status and registration state model.
- Staff should not need to enter English in this step to save or publish.

### Step 2: Registration Settings

Fields:

- Maximum participants, where `0` still means unlimited.
- Registration close time.
- Requires approval.
- Allow waitlist.
- Allow cancellation.
- Registration fee.
- Payment instructions.

Implementation notes:

- Keep payment instructions bilingual, but default to Chinese editing.
- Public registration availability must still be checked server-side.
- Waitlist and approval flags should be stored even if some downstream workflows are basic in the first implementation.

### Step 3: Participant Questions

Questions are added as cards. Each question card supports:

- Expand/collapse
- Edit
- Delete
- Copy
- Move up/down
- Required toggle
- Question type
- Bilingual label/help/options with Chinese shown by default

Supported question types:

- Text
- Single choice
- Multiple choice
- Yes/no
- Date
- Phone

Suggested quick-add templates:

- Do you need carpool coordination?
- If you are driving, how many open seats do you have?
- Do you need lodging coordination?
- What is your ski/snowboard level?
- Ski or snowboard?
- Do you need rental gear?
- Do you have Ikon / Epic / Big Bear Pass?

Implementation notes:

- The product should not present carpooling or room-sharing as built-in matching features. Copy should frame these as coordination questions.
- Question keys should be stable and unique per event.
- Choice-based questions require at least one option before publish.

### Step 4: Event Detail Modules

Detail modules are added as cards. Each module supports:

- Title
- Content
- List mode
- Rich text mode
- Expand/collapse
- Delete
- Copy
- Move up/down
- Bilingual fields with Chinese shown by default

Supported module types:

- Event introduction
- Highlights
- Itinerary
- Notes
- Fee details
- Refund policy
- Contact information
- Custom module

Implementation notes:

- Modules are optional except publish validation should require enough public detail for the event to be understandable.
- List mode stores ordered bilingual string arrays.
- Rich text mode stores bilingual string content.
- Module type provides default labels, but title remains editable.

### Step 5: Preview and Publish

Actions:

- Mobile preview
- Save draft
- Publish event
- Copy event
- Share link
- View registration list

Implementation notes:

- Save draft should allow incomplete records.
- Publish should run stricter validation and return actionable missing-field messages.
- Copy event is visible as a secondary action in the design, but the first implementation can keep it disabled until a dedicated copy action is built.
- Share link should be disabled or secondary while the event is still a draft.

## Multilingual Model

The editor defaults to Chinese. Staff can switch the active editing language between `中文` and `English`.

Rules:

- Do not show two large Chinese/English panels side by side.
- All user-facing event strings that need translation are stored as bilingual fields.
- English fields are optional for publishing.
- Public pages render the selected language when present.
- If English is empty, public English pages fallback to Chinese.
- SEO fields remain stored as bilingual fields, but they are not prominent in the main flow. The first implementation does not generate SEO text automatically.

## Data Model

### `events`

Core fields:

- `slug text primary key`
- `status text not null default 'draft' check (status in ('draft', 'published', 'archived'))`
- `registration_state text not null default 'closed' check (registration_state in ('open', 'closed', 'full'))`
- `title_zh text not null default ''`
- `title_en text not null default ''`
- `event_date date`
- `meet_time time`
- `meet_location_zh text not null default ''`
- `meet_location_en text not null default ''`
- `activity_location_zh text not null default ''`
- `activity_location_en text not null default ''`
- `location_url text not null default ''`
- `cover_image text not null default ''`
- `capacity integer not null default 0`
- `registration_close_at timestamptz`
- `requires_approval boolean not null default false`
- `allow_waitlist boolean not null default false`
- `allow_cancellation boolean not null default true`
- `fee_amount text not null default ''`
- `payment_instructions_zh text not null default ''`
- `payment_instructions_en text not null default ''`
- `seo_title_zh text not null default ''`
- `seo_title_en text not null default ''`
- `seo_description_zh text not null default ''`
- `seo_description_en text not null default ''`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Notes:

- `event_date` plus `meet_time` matches the requested creation flow.
- If implementation still needs precise start/end timestamps for existing availability helpers, derive or add `event_start_at` and `event_end_at`. The implementation plan should choose one representation and keep it consistent.
- `fee_amount` remains text because SnowForce events may use nuanced fee copy instead of fixed checkout pricing.

### `event_registration_questions`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `event_slug text not null references events(slug) on delete cascade`
- `question_key text not null`
- `type text not null check (type in ('text', 'single_choice', 'multiple_choice', 'yes_no', 'date', 'phone'))`
- `required boolean not null default false`
- `sort_order integer not null default 0`
- `label_zh text not null default ''`
- `label_en text not null default ''`
- `help_zh text not null default ''`
- `help_en text not null default ''`
- `options_zh jsonb not null default '[]'`
- `options_en jsonb not null default '[]'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `unique(event_slug, question_key)`

### `event_detail_modules`

Fields:

- `id uuid primary key default gen_random_uuid()`
- `event_slug text not null references events(slug) on delete cascade`
- `module_type text not null check (module_type in ('intro', 'highlights', 'itinerary', 'notes', 'fees', 'refund', 'contact', 'custom'))`
- `display_mode text not null default 'rich_text' check (display_mode in ('rich_text', 'list'))`
- `sort_order integer not null default 0`
- `title_zh text not null default ''`
- `title_en text not null default ''`
- `content_zh text not null default ''`
- `content_en text not null default ''`
- `items_zh jsonb not null default '[]'`
- `items_en jsonb not null default '[]'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `registrations`

Keep the table concept but update validation around modular questions:

- `answers jsonb not null default '{}'`
- Answers are keyed by `question_key`.
- For `multiple_choice`, answer values should be arrays.
- For other field types, answer values should be strings or booleans depending on type.

## Migration Strategy

Create a destructive migration for the new project state:

1. Drop existing activity tables that depend on `events`, including `registrations`, before recreating the activity schema.
2. Recreate `events` with the new core fields.
3. Create `event_registration_questions`.
4. Create `event_detail_modules`.
5. Recreate or alter `registrations` to reference the rebuilt `events`.
6. Recreate indexes, RLS policies, and `updated_at` triggers.

RLS expectations:

- Public can select only `events.status = 'published'`.
- Public can select questions/modules only through published event rows.
- Registrations are still inserted through server-side commands, not direct anonymous inserts.
- Admin writes still use server-side service credentials after `requireAdmin()`.

## Application Architecture

### Types

Extend `src/lib/types.ts` with:

- `EventRegistrationQuestion`
- `EventDetailModule`
- `EventDetailModuleType`
- `EventQuestionType`
- Updated `Event`

The updated `Event` should include:

- Core fields
- `registrationQuestions: EventRegistrationQuestion[]`
- `detailModules: EventDetailModule[]`
- Existing computed `registrationCount`

### Repository

Update `src/lib/events/repository.ts` so event reads load:

- Event row
- Ordered registration question rows
- Ordered detail module rows
- Registration counts

Writes should support saving an event aggregate in one logical operation. If Supabase RPC is not used, server actions can perform the multi-table write using the service-role client:

1. Upsert event core row.
2. Delete existing questions/modules for the event.
3. Insert submitted questions/modules in order.

Because this is admin-only and event payloads are small, replace-all is acceptable for the first implementation.

### Validation

Update `src/lib/events/validation.ts` for:

- Draft save validation: parse shape, normalize empty strings, ensure known enum values, ensure non-negative capacity.
- Publish validation: require Chinese title, event date, meet time, activity location, registration close time when registration is open, and at least one meaningful detail module.
- Question validation: enforce keys, labels, choice options, and type-specific answer requirements.
- Module validation: enforce valid module type/display mode and at least one body field for publishable modules.

### Server Actions

Update `src/lib/events/actions.ts`:

- Keep `requireAdmin()` on every mutation.
- Save the full editor payload through `saveEventAction`.
- Keep publish/unpublish/archive actions.
- Refresh `/`, `/events`, `/events/[slug]`, `/admin`, and `/admin/events`.
- Preserve archive-to-recap behavior if the updated event model still provides enough title/date/location data.

### Admin UI

Replace or split `src/components/admin/event-editor-form.tsx` into smaller units:

- `event-editor-form.tsx`: aggregate state and server action submission.
- `event-editor-stepper.tsx`: vertical step navigation and completed summaries.
- `event-basic-step.tsx`
- `event-registration-settings-step.tsx`
- `event-question-builder.tsx`
- `event-detail-module-builder.tsx`
- `event-preview-panel.tsx`

The first implementation can keep these in fewer files if that better matches project size, but the large current form should not remain a single monolith.

### Public Event Detail

Update `src/components/events/event-detail-view.tsx`:

- Keep the top summary section.
- Render detail body by iterating through `event.detailModules`.
- Render list modules as lists and rich text modules as multiline text.
- Use language fallback helpers so empty English content displays Chinese.
- Render fee/payment details from core fields or fee modules consistently.

### Registration Form

Update `src/components/events/registration-form.tsx` and server validation:

- Render fields from `event.registrationQuestions`.
- Map question types to controls.
- Validate server-side answers against the question definitions.
- Keep contact fields and consent behavior as product-level requirements in this implementation.

## Error Handling

- If Supabase config is missing, public pages should show the existing empty/unavailable states rather than stack traces.
- Admin save errors should preserve local form input and show a readable error.
- Publish errors should list missing or invalid areas by step.
- Registration submission must reject invalid answers even if the client UI was modified.

## Testing

Use TDD during implementation.

Test areas:

- Mappers for event aggregate rows, questions, and modules.
- Validation for draft save, publish checks, question config, module config, and registration answers.
- Repository behavior with fake sources for public filtering, admin reads, and aggregate writes.
- Server action behavior for validation failure, save success, and publish failure.
- Registration form validation for new question types.
- Public detail rendering fallback behavior can be covered with focused component tests if the project test setup supports it.

Final verification:

- Run targeted Vitest tests for changed modules.
- Run `npm test`.
- Run `npm run build`.
- If a dev server is used for UI verification, stop other Next processes first to avoid `.next` corruption.

## Acceptance Criteria

- Admin staff can create an event through the five-step editor.
- Staff can save incomplete drafts.
- Staff can add, edit, copy, delete, collapse, and reorder participant questions.
- Staff can add, edit, copy, delete, collapse, and reorder detail modules.
- The editor defaults to Chinese and allows switching to English without showing side-by-side language panels.
- Publishing validates required Chinese/core event content and blocks incomplete events with actionable messages.
- Public event detail pages render ordered modules from the database.
- English public pages fallback to Chinese when English content is empty.
- Registrations render and validate modular participant questions.
- The database migration rebuilds activity-related tables around the new modular model.
