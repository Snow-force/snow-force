# src/lib/members KNOWLEDGE BASE

## OVERVIEW
Member identity, auth flows, structured profiles, dashboard aggregation, and supporting table persistence. Uses Supabase Auth for sessions and RLS-protected tables for profile/pass/equipment/saved-event/notification data.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Auth flows (login/register/magic/OAuth/reset) | `actions.ts` | Server actions with `"use server"`; all redirects through `/auth/callback`. |
| Auth parsing/normalization | `member-entry.ts` | Zod-free parsers for login, register, magic link, password reset, profile update. |
| Auth callback & status messages | `auth-results.ts` | `sanitizeMemberNextPath()` restricts redirect targets; `authStatusMessage()` maps codes to copy. |
| Profile row ↔ domain mapping | `profile-fields.ts` | `normalizeMemberProfileRow()` with enum guards; `profileUpdateToRow()` for writes. |
| Profile persistence | `repository.ts` | `getMemberProfile()`, `updateMemberProfile()` via Supabase SSR server client. |
| Dashboard data aggregation | `dashboard.ts` | `buildMemberDashboard()`: upcoming/history/saved/notifications/recent recaps from profile + events + registrations + recaps. |
| Supporting tables CRUD | `supporting.ts` | `member_passes`, `member_equipment`, `saved_events`, `notifications` — own RLS per table. |

## CONVENTIONS
- All server actions redirect to `/member?key=value` for success/error status; the `MemberStatusMessage` component maps these to user-facing copy.
- Profile fields use structured enums (`riderType`, `riderLevel`) via `member-entry.ts` parsers; legacy bilingual `rider_level_en/zh` columns retained for backward compat.
- `getCurrentMemberAccount()` returns `{ user, profile, emailConfirmed }` — this is the canonical auth state check. Prefer it over `getCurrentMemberProfile()` when email verification matters.
- Magic link and OAuth callbacks route through `/auth/callback` with sanitized `next` params.

## ANTI-PATTERNS
- Do not call `getCurrentMemberProfile()` when email verification state is needed; use `getCurrentMemberAccount()`.
- Do not expose `auth-results.ts` status codes as user-visible URLs without mapping through `MemberStatusMessage`.
- Do not add member auth redirects that bypass `/auth/callback`.
- Do not use `raw_user_meta_data` for authorization decisions in RLS policies or server logic.

## TESTING
- `member-entry.test.ts`: parser normalization and validation.
- `auth-results.test.ts`: redirect sanitization and status message mapping.
- `profile-fields.test.ts`: row defaults, enum guards, update payload filtering.
- `dashboard.test.ts`: upcoming/history splitting, saved event resolution, notification generation.
