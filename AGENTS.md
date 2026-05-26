# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-24
**Commit:** 8dee71b
**Branch:** codex/homepage-immersive-redesign

## OVERVIEW
SnowForce is a bilingual EN/ZH snow sports activity platform built with Next.js 14 App Router, TypeScript, Tailwind, Vitest, and Supabase. Public pages sell events and recaps; admin pages operate event content, registrations, recaps, FAQs, and inquiries behind a local staff password session.

## STRUCTURE
```
./
├── src/app/                 # App Router routes, server data loading, admin route guards
├── src/components/          # Client UI by surface: site, events, admin, recaps
├── src/lib/                 # Domain repositories, server actions, auth, Supabase adapters
├── supabase/migrations/     # Schema, RLS, status constraints, recap linkage
├── docs/superpowers/        # Implementation plans/specs; useful context, not runtime docs
├── PRODUCT.md               # Product register, users, principles
└── DESIGN.md                # SnowForce design system and bans
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Public event list/detail | `src/app/events`, `src/components/events` | Route pages read repositories server-side, render client components for language switching. |
| Admin event workflow | `src/app/admin/events`, `src/components/admin`, `src/lib/events` | Mutations go through server actions after `requireAdmin()`. |
| Archive to recap workflow | `src/lib/events/actions.ts`, `src/lib/recaps`, `src/app/admin/recaps` | Archive creates draft recap, editor adds media, status route publishes public recaps. |
| Registrations | `src/lib/registrations`, `src/components/events/registration-form.tsx` | Client validates UX; server action rechecks event state, window, capacity, required fields. |
| Member auth/profile | `src/lib/members`, `src/app/member` | Uses Supabase Auth browser/server client helpers, separate from local staff admin session. |
| Staff admin auth | `src/lib/auth/admin.ts`, `src/app/staff-login`, `src/app/admin/layout.tsx` | Signed httpOnly cookie, not Supabase staff auth yet. |
| Database/RLS changes | `supabase/migrations` | Apply migrations before relying on new statuses/columns. |
| Design/product rules | `PRODUCT.md`, `DESIGN.md` | Product register. Public pages may be energetic; admin stays practical. |

## CODE MAP
| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `requireAdmin()` | server auth guard | `src/lib/auth/admin.ts` | Gate every admin page/action/route mutation. |
| `createEventRepository()` | repository factory | `src/lib/events/repository.ts` | Inject sources for tests; default is Supabase. |
| `parseEventEditorInput()` | Zod parser | `src/lib/events/validation.ts` | Admin event form normalization and validation. |
| `archiveEventAction()` | server action | `src/lib/events/actions.ts` | Archive event, close registration, create recap draft. |
| `createRecapRepository()` | repository factory | `src/lib/recaps/repository.ts` | Public/admin recap reads, insert/update mapping. |
| `updateSession()` | middleware adapter | `src/lib/supabase/middleware.ts` | Supabase auth cookie refresh for member flows. |
| `LanguageProvider` | client context | `src/lib/language.tsx` | Runtime EN/ZH selection via cookie. |
| `createJsonArrayStore()` | fallback persistence | `src/lib/server/json-store.ts` | `.data` storage for non-Supabase fallback domains. |

## CONVENTIONS
- Path alias: `@/*` maps to `./src/*`.
- Server actions live in `src/lib/*/actions.ts` and start with `"use server"`.
- Interactive/bilingual rendering components usually start with `"use client"` and call `useLanguage()`.
- Public repository reads expose only `published` rows even when RLS also filters them.
- Admin reads/writes use server-only Supabase secret/service-role key after local `requireAdmin()`.
- Repository factories take a source object so Vitest can use deterministic fakes.
- Bilingual data uses `{ en, zh }`; arrays use `{ en: string[], zh: string[] }`.
- Cover/media are URL/path strings in this increment. No Supabase Storage upload UI exists yet.
- `capacity === 0` means unlimited capacity.

## ANTI-PATTERNS (THIS PROJECT)
- Never import privileged Supabase admin/service client into client components.
- Do not grant anonymous direct inserts for registrations or inquiries; server commands own validation/spam controls.
- Do not edit seed data for day-to-day operational event updates once Supabase is configured.
- Do not present carpooling or room-sharing as built-in product features; copy may mention community/WeChat coordination only.
- Do not silently assume public data is correct when Supabase config or migrations are missing.
- Do not use `as any`, `@ts-ignore`, or `@ts-expect-error`.
- Do not remove existing dirty worktree changes without explicit instruction.

## UNIQUE STYLES
- Product register: public discovery can be lively; admin screens should be dense, calm, and scannable.
- Design rules from `DESIGN.md`: blue has a job, dark bands need active content, no gradient text, no side-stripe accents, no generic SaaS dashboard look.
- Admin editor forms intentionally show English and Chinese panels side by side instead of hiding one language.
- Public pages catch repository errors and render empty/not-found states rather than exposing stack traces.

## COMMANDS
```bash
npm run dev       # Next dev server
npm test          # Vitest, currently colocated *.test.ts
npm run build     # Next build, also type/lint gate
npm run lint      # Next lint script, if Next lint support is available
supabase db push  # Apply migrations to linked project when schema changes
```

## NOTES
- TypeScript LSP is not installed in this environment; use `npm run build`, AST-grep, and targeted tests for verification.
- `.env.local` contains real local credentials. Do not print or copy values into logs/docs.
- Local Next dev/build can corrupt `.next` if multiple Next processes write concurrently. Stop project Node/Next processes before clean rebuilds.
- `.omo/`, `.playwright-mcp/`, `.superpowers/`, `.next/`, `node_modules/`, and `.data/` are tool/runtime state, not source knowledge.
