# src/components/admin KNOWLEDGE BASE

## OVERVIEW
Client-side staff admin UI. Server routes/layouts authenticate and fetch data; these components render dense bilingual operational controls.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Admin shell/nav | `admin-shell.tsx`, `admin-nav.tsx` | Staff tabs and sign-out wrapper. |
| Copy/i18n labels | `admin-copy.ts` | Central admin bilingual strings; has `admin-copy.test.ts`. |
| Event list/actions | `admin-events-view.tsx` | Edit, publish, archive, registration open/close forms. |
| Event editor | `event-editor-form.tsx`, `event-editor-heading.tsx` | Full bilingual editor; JSON registration field textarea. |
| Recap list/status | `admin-recaps-view.tsx` | Draft/published toggle hits `/admin/recaps/status`. |
| Recap editor | `recap-editor-form.tsx` | Media URLs and EN/ZH captions are line-aligned textareas. |

## CONVENTIONS
- Components are `"use client"` because they call `useLanguage()` and handle local UI state.
- Admin route pages/layouts own `requireAdmin()` and server-side data loading.
- Forms call server actions directly when possible; recap status toggle uses a POST route so state can update without full navigation.
- English and Chinese content panels stay visible together for staff editing.
- Dense admin inputs use rectangular 4px-ish rounded fields, not public pill controls.
- Publish/draft badges use subdued status colors; keep operational scan speed over decoration.

## ANTI-PATTERNS
- Do not import Supabase clients or secrets in admin client components.
- Do not hide one language behind tabs in editors unless product explicitly changes the bilingual workflow.
- Do not move auth checks into client components.
- Do not add decorative product-marketing effects to admin tables/forms.
- Do not bypass `adminCopy` for repeated labels that need EN/ZH support.

## GOTCHAS
- `AdminRecapsView` keeps local `recaps` state after status toggles. If server return shape changes, update this component.
- `recap-editor-form.tsx` aligns media rows by line index across URL, EN caption, and ZH caption fields.
- `event-editor-form.tsx` disables capacity input when unlimited; hidden/action parsing sends `capacity=0` through `unlimitedCapacity`.
