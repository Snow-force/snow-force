# Admin Bilingual UI Repair Design

## Goal

Repair the admin experience so its interface copy follows the existing site language switcher instead of mixing Chinese navigation with English admin labels. After the repair, create one draft test event through the admin workflow to verify the editor can write to Supabase without publishing test content publicly.

## Scope

This pass covers the admin event workflow currently used for Supabase-backed activity management:

- Admin shell copy in the `/admin` layout.
- Admin dashboard stats and recent registration copy.
- Event management list copy, event state labels, actions, and bilingual-content audit copy.
- New and edit event headings and the event editor form labels, section names, registration state options, and save button.

Existing admin recap and FAQ screens already use the shared language hook and stay unchanged except for any incidental shell copy they inherit.

## UX Direction

The admin UI follows the same `中 / EN` language choice as the public site. When Chinese is active, admin interface labels render in Chinese; when English is active, they render in English.

The event editor still shows both content-entry panels at the same time. Those panels are editing fields, not interface language modes, so editors can enter English and Chinese activity content in one pass.

## Architecture

Server admin pages keep their data loading and auth checks. Client-facing admin copy that needs the existing `useLanguage()` context moves into focused client components where needed:

- Keep server wrappers responsible for `requireAdmin()` and repository calls.
- Render localized shell, dashboard, event list, and editor UI through client components or existing client components.
- Use the existing bilingual object pattern and `useLanguage().t()` instead of introducing a separate translation system.

## Test And Verification

- Add focused coverage for localized admin copy helpers/components where practical before production edits.
- Run the project test suite, TypeScript check, and lint after implementation.
- Verify in the in-app browser that admin copy switches between Chinese and English on `/admin`, `/admin/events`, and `/admin/events/new`.
- Submit one draft test event from `/admin/events/new`, confirm it appears in admin event management, and keep it unpublished so it does not become public activity content.

