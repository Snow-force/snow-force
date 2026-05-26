# src/lib KNOWLEDGE BASE

## OVERVIEW
Domain logic, persistence adapters, server actions, auth helpers, and shared types. Most user-visible correctness bugs start here, not in route files.

## STRUCTURE
```
src/lib/
├── auth/             # Local staff/member signed-token helpers
├── events/           # Event repository, mapper, validation, admin actions
├── registrations/    # Registration server action and persistence source
├── recaps/           # Recap repository/actions, archive integration target
├── members/          # Supabase Auth member profile flow
├── supabase/         # Browser/server/middleware Supabase SSR clients
├── server/           # JSON fallback store utilities
└── types.ts          # Cross-domain domain model types
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Add domain fields | `types.ts`, matching mapper/repository/tests | Update row mapping and migrations together. |
| Server mutation | `*/actions.ts` | Start with `"use server"`; auth first, validate, write, revalidate/redirect last. |
| Public data read | `*/repository.ts` | Public methods filter to published/allowed state even with RLS. |
| Admin data read/write | `*/repository.ts` + `auth/admin.ts` | Use server-only Supabase key after `requireAdmin()`. |
| Fallback local storage | `server/json-store.ts` | Registrations/inquiries can persist in `.data` when Supabase source is absent. |
| Member auth | `members/actions.ts`, `supabase/server.ts` | Uses Supabase Auth cookie/session helpers, not local admin cookie. |

## CONVENTIONS
- Repository factories (`createEventRepository`, `createRecapRepository`, `createRegistrationRepository`) accept source objects for tests.
- Database rows are snake_case; domain types are camelCase/bilingual objects.
- Public and admin repository methods are intentionally separate (`getEvent` vs `getEventAdmin`, `getRecap` vs `getRecapAdmin`).
- Server action helpers expose pure-ish result functions where Next redirects/cookies are hard to test.
- Revalidate every public path affected by status/content changes; status toggles are cache bugs if only admin pages refresh.
- Fire-and-forget email failures must not fail registration.

## ANTI-PATTERNS
- Do not bypass repositories from components.
- Do not trust client validation for registrations; server action must recheck event open state, window, capacity, and required fields.
- Do not use the Supabase service key in any browser/client file.
- Do not catch repository errors and pretend writes succeeded. If best-effort is intended, log and keep the primary action explicit.
- Do not mutate operational event content in `seed.ts` once Supabase is active.

## TESTING
- Use Vitest colocated `*.test.ts` files.
- Prefer source/repository fakes over networked Supabase in tests.
- For new repository behavior, test both public filtering and admin visibility.
- For server actions, extract result helpers when direct action testing would require Next cookies/redirect machinery.
