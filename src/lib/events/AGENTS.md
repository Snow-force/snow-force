# src/lib/events KNOWLEDGE BASE

## OVERVIEW
Event domain: Supabase-backed operational source for public activities, admin editor, archive state, registration availability, and registration-count enrichment.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Event DB mapping | `mappers.ts` | Owns snake_case row to `Event` conversion and strict registration field shape checks. |
| Admin editor validation | `validation.ts` | Zod parser, status enum, date ordering, publish-required fields. |
| Event persistence | `repository.ts` | Public/admin Supabase clients, registration counts, repository factory. |
| Admin publish/archive | `actions.ts` | `publishEventResult`, `archiveEventResult`, server actions and revalidation. |
| Capacity/open logic | `availability.ts` | `capacity === 0` is unlimited. Registration action depends on these helpers. |
| Reference/import data | `seed.ts` | Development/import reference only once Supabase is configured. |

## CONVENTIONS
- `EventStatus` includes `draft`, `published`, `archived`; DB needs matching constraint migration.
- `archiveEventAction()` closes registration and creates a draft recap via `createRecapFromEvent(event)`.
- Public `getEvents()` and `getEvent()` return only `published` events.
- Admin `getAllEvents()` and `getEventAdmin()` can see drafts/archived.
- `updateEvent()` reads current admin row, merges partial domain data, then writes the full mapped row.
- Registration count is not stored on event rows; repository enriches it from registrations.

## ANTI-PATTERNS
- Do not publish incomplete bilingual/logistical events; use `validatePublishableEvent()`.
- Do not change event slugs on existing records through the editor.
- Do not assume seed registration counts reflect Supabase counts.
- Do not treat `capacity=0` as full or missing; it means unlimited.
- Do not archive without revalidating admin/public event surfaces and recap management.

## TESTING
- `actions.test.ts`: publish validation and archive result behavior.
- `validation.test.ts`: editor parsing, archived status, date/order validation.
- `repository.test.ts`: public/admin filtering and count enrichment.
- `mappers.test.ts`: row/domain conversion, invalid registration field rejection.
- Add tests here when changing status semantics, registration fields, capacity, or row mappings.
