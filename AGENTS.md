# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-27
**Commit:** 53dfdb9
**Branch:** main

## OVERVIEW
SnowForce is a bilingual EN/ZH snow sports activity platform built with Next.js 16 App Router, React 19, TypeScript, Tailwind, Vitest 5, and Supabase. The root runtime is Node.js 24. Public pages sell events and recaps; member auth/dashboard uses Supabase SSR; admin pages operate event content, registrations, recaps, FAQs, and inquiries behind staff sessions. Read the installed version's guides in `node_modules/next/dist/docs/` before framework changes.

## STRUCTURE
```
./
├── src/app/                 # App Router routes, server data loading, admin route guards
│   └── auth/callback/       # Supabase SSR code exchange → redirect
├── src/components/          # Client UI by surface: site, events, members, admin, recaps
├── src/lib/                 # Domain logic: repositories, server actions, auth, Supabase clients
│   ├── members/             # Supabase Auth flows, structured profiles, dashboard, supporting tables
│   ├── registrations/       # Registration validation, actions, member gating, autofill
│   │   └── member-gate.ts   # Verified-email gate + profile autofill for event forms
│   ├── payments/            # Server-only Stripe client, checkout session action, webhook handler
├── supabase/migrations/     # Schema, RLS, member expansion, supporting tables
├── proxy.ts                  # Supabase SSR session refresh (root-level)
├── PRODUCT.md               # Product register, users, principles
└── DESIGN.md                # SnowForce design system and bans
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Public event list/detail | `src/app/events`, `src/components/events` | Route pages read repositories server-side, render client components for language switching. |
| Admin event workflow | `src/app/admin/events`, `src/components/admin`, `src/lib/events` | Mutations go through server actions after `requireAdmin()`. |
| Archive to recap workflow | `src/lib/events/actions.ts`, `src/lib/recaps`, `src/app/admin/recaps` | Archive creates draft recap, editor adds media, status route publishes public recaps. |
| Registrations | `src/lib/registrations`, `src/components/events/registration-form.tsx` | Client validates UX; server action rechecks event state, window, capacity, required fields, email verification. |
| Member auth gateway | `src/components/members/member-auth-panel.tsx`, `src/lib/members/actions.ts` | Immersive hero + auth card; login/register/magic/Google OAuth/forgot/reset flows. |
| Member dashboard | `src/components/members/member-dashboard.tsx`, `src/lib/members/dashboard.ts` | Portal: upcoming trips, registration cards, saved events, notifications, recaps. |
| Member profile | `src/components/members/profile-form.tsx`, `src/lib/members/repository.ts`, `src/lib/members/profile-fields.ts` | Structured rider fields, passes, equipment, emergency contacts. |
| Staff admin auth | `src/lib/auth/admin.ts`, `src/app/staff-login`, `src/app/admin/layout.tsx` | Signed httpOnly cookie, not Supabase staff auth yet. |
| Database/RLS changes | `supabase/migrations` | Apply migrations before relying on new statuses/columns/tables. |
| Design/product rules | `PRODUCT.md`, `DESIGN.md` | Product register. Public pages may be energetic; admin stays practical. |
| Event payment | `src/lib/payments/`, `src/lib/events/validation.ts` (paymentModel field), `src/components/events/registration-form.tsx` (CTA) | Stripe Checkout for deposit/full_prepay events. |
| Stripe webhook | `src/app/api/stripe/webhook/route.ts` | Receives `checkout.session.completed`, promotes pending registration. |
| Event sharing | `src/components/events/event-share-bar.tsx`, `src/lib/events/share-payload.ts` | Share URL + QR code builders for public event pages. |

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
| `getCurrentMemberAccount()` | server helper | `src/lib/members/actions.ts` | Auth user + profile + email confirmed check. |
| `buildMemberDashboard()` | aggregation | `src/lib/members/dashboard.ts` | Upcoming/history/saved/notifications/recaps from registrations/events. |
| `sanitizeMemberNextPath()` | auth security | `src/lib/members/auth-results.ts` | Callback redirect sanitizer; only allows /member, /events, /recaps. |
| `normalizeMemberProfileRow()` | data mapper | `src/lib/members/profile-fields.ts` | DB row → typed MemberProfile with enum guards. |
| `canSubmitMemberRegistration()` | registration gate | `src/lib/registrations/member-gate.ts` | Blocks unverified members; returns memberId or null. |
| `autofillRegistrationAnswers()` | autofill | `src/lib/registrations/member-gate.ts` | Pre-fills event form from member profile. |
| `createCheckoutSessionAction()` | server action | `src/lib/payments/actions.ts` | Create Stripe Checkout Session for a pending registration. |
| `verifyStripeWebhookSignature()` | server helper | `src/lib/payments/stripe-server.ts` | Verify Stripe webhook signature. |
| `buildShareUrl()` / `buildQrCodeDataUrl()` | pure helpers | `src/lib/events/share-payload.ts` | Share URL + QR code data URL builders. |
| `getPendingRegistrationById()` | repository helper | `src/lib/registrations/pending-repository.ts` | Look up a pending registration by id (used by checkout + webhook). |

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
- Auth redirects route through `/auth/callback` for Supabase SSR code exchange; never directly to `/member`.
- `member_profiles` uses structured fields (riderType/riderLevel) alongside legacy bilingual columns.
- Supporting tables (`member_passes`, `member_equipment`, `saved_events`, `notifications`) back the new member portal.
- Stripe webhook Events are deduplicated via `public.stripe_webhook_events.event_id` primary key; never process the same Stripe event id twice.
- Stripe Checkout sessions carry `metadata.pendingRegistrationId` so the webhook can promote the pending registration on `checkout.session.completed`.
- Per-event `paymentModel` (free | deposit | full_prepay) drives whether checkout is shown and how `RegistrationFinance` fields auto-populate on webhook.

## ANTI-PATTERNS (THIS PROJECT)
- Never import privileged Supabase admin/service client into client components.
- Do not grant anonymous direct inserts for registrations or inquiries; server commands own validation/spam controls.
- Do not edit seed data for day-to-day operational event updates once Supabase is configured.
- Lodging rollout: staff-only hotel, room-type and event-offer drafts are supported behind LODGING_ADMIN_ENABLED. Public room sales remain disabled until inventory, payment and refund batches pass validation. Do not present carpooling or room-sharing as built-in features; whole-unit lodging is the planned first sales scope.
- Do not silently assume public data is correct when Supabase config or migrations are missing.
- Do not use `as any`, `@ts-ignore`, or `@ts-expect-error`.
- Do not remove existing dirty worktree changes without explicit instruction.
- Do not use `raw_user_meta_data` for authorization decisions.
- Do not put `security definer` functions in public schema.
- Do not import `stripe` or `qrcode` into client components; both are server-only.
- Do not call `request.json()` in the Stripe webhook route; signature verification requires the raw body via `await request.text()`.
- Do not trust `metadata.paymentModel` or `metadata.amount` in the webhook; re-read from the DB and `session.amount_total`.

## UNIQUE STYLES
- Product register: public discovery can be lively; admin screens should be dense, calm, and scannable.
- Design rules from `DESIGN.md`: blue has a job, dark bands need active content, no gradient text, no side-stripe accents, no generic SaaS dashboard look.
- Admin editor forms intentionally show English and Chinese panels side by side instead of hiding one language.
- Public pages catch repository errors and render empty/not-found states rather than exposing stack traces.

## COMMANDS
```bash
npm run dev       # Next dev server
npm test          # Vitest, currently colocated *.test.ts
npm run build     # ESLint, then Next build with type checking
npm run lint      # ESLint CLI for the website source and config
supabase db push  # Apply migrations to linked project when schema changes
```

## TESTING REQUIREMENTS
- For every source, configuration, migration, or dependency change, add or update focused tests for the changed behavior.
- Before handing off, committing, or deploying a change, run `npm test` and `npm run build`; both must pass. Do not deploy when either command fails.
- Run `npm run test:coverage` when adding or materially changing tests, and use its report to identify uncovered security or payment paths.
- Treat unexpected test-console output, React `act(...)` warnings, and build warnings as follow-up work; do not suppress failures with skipped tests, broad mocks, or lowered checks.

## NOTES
- TypeScript LSP is not installed in this environment; use `npm run build`, AST-grep, and targeted tests for verification.
- `.env.local` contains real local credentials. Do not print or copy values into logs/docs.
- Local Next dev/build can corrupt `.next` if multiple Next processes write concurrently. Stop project Node/Next processes before clean rebuilds.
- `.omo/`, `.playwright-mcp/`, `.superpowers/`, `.next/`, `node_modules/`, and `.data/` are tool/runtime state, not source knowledge.
- Root `proxy.ts` and `src/proxy.ts` delegate to `src/lib/supabase/middleware.ts`; Next.js 16 uses the proxy convention and Node runtime.
- Server `cookies()`, `headers()`, route `params` / `searchParams`, and `src/lib/supabase/server.ts` `createClient()` are asynchronous; await them in every caller and test mock.
- After deploying any current workspace content to Vercel, commit and push the deployed source changes to GitHub in the same workflow unless explicitly told not to.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

