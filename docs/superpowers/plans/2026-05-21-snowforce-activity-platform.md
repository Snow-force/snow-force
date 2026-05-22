# SnowForce Activity Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bilingual SnowForce activity operations site with public event discovery, native registration, past recaps, a staff admin surface, and lightweight email-based member profiles.

**Architecture:** Build one Next.js TypeScript application for public pages, member pages, and staff admin pages. Keep the registration domain logic server-side and typed so event-state validation, configurable field validation, persistence, and notification triggering stay reusable. Use Supabase for database/auth/storage integration points, with local seed/fallback data where needed to keep the first scaffold runnable before production credentials exist.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Supabase, Zod, Vitest or the repo-selected unit test runner, Playwright-ready public routes.

---

## File Map

- App shell and public routes: `src/app`, `src/components/site`, `src/components/events`.
- Domain contracts and validation: `src/lib/events`, `src/lib/registrations`, `src/lib/members`.
- Infrastructure adapters: `src/lib/supabase`, `src/lib/email`, `supabase/migrations`.
- Staff routes and controls: `src/app/admin`, `src/components/admin`.
- Tests: colocated unit tests under `src/**/*.test.ts` or the generated repo test convention.

## Task 1: Scaffold The Full-Stack Site Foundation

**Files:**
- Create: `package.json`, framework config, TypeScript config, lint/test config, `src/app/layout.tsx`, `src/app/page.tsx`
- Create: initial shared UI and seed content modules under `src/components` and `src/lib`
- Test: initial app/unit test files selected by the scaffold

- [ ] **Step 1: Scaffold a runnable Next.js TypeScript application in the empty workspace.**
- [ ] **Step 2: Add the SnowForce site shell with bilingual-ready navigation, homepage sections for active events, recap proof, FAQ teaser, partner inquiry teaser, and member entry.**
- [ ] **Step 3: Add typed seed content for at least one current event, one recap, and FAQ items so routes can render before Supabase credentials exist.**
- [ ] **Step 4: Add focused tests for the seed content contracts or homepage rendering path according to the selected test setup.**
- [ ] **Step 5: Run install, lint, test, and build checks available after scaffolding.**

## Task 2: Model Events And Public Event Routes

**Files:**
- Create/modify: `src/lib/events/*`
- Create/modify: `src/app/events/page.tsx`, `src/app/events/[slug]/page.tsx`
- Create/modify: `src/components/events/*`
- Test: event query, status, and public rendering tests

- [ ] **Step 1: Define event types, bilingual content contracts, registration field config shape, publish state, and registration state helpers.**
- [ ] **Step 2: Add public event index and detail pages using seed repository adapters that can later be backed by Supabase.**
- [ ] **Step 3: Render event capacity/registration state, audience level, location, timing, notices, and registration call to action from typed data.**
- [ ] **Step 4: Cover published/unpublished and open/closed state behavior with tests.**
- [ ] **Step 5: Verify lint, tests, and build.**

## Task 3: Build Registration Domain And Visitor Form

**Files:**
- Create/modify: `src/lib/registrations/*`
- Create/modify: `src/components/events/registration-form.tsx`
- Create/modify: server action or route handler under `src/app`
- Test: registration schema, event availability validation, and form submission behavior

- [ ] **Step 1: Implement Zod validation for default registration fields and event-configured required fields.**
- [ ] **Step 2: Add a server-side registration command that rejects unavailable events, persists a registration through an adapter, and returns typed success/failure results.**
- [ ] **Step 3: Add a visitor registration form to event detail pages with confirmation and recoverable validation states.**
- [ ] **Step 4: Add notification adapter boundaries so confirmation email and staff notification can be wired without coupling persistence to delivery success.**
- [ ] **Step 5: Verify tests for open registration success, closed event rejection, missing consent, and notification-failure persistence behavior.**

## Task 4: Add Supabase Schema And Lightweight Member Area

**Files:**
- Create: `supabase/migrations/*`
- Create/modify: `src/lib/supabase/*`, `src/lib/members/*`
- Create/modify: member auth/profile/history routes under `src/app`
- Test: profile validation and registration history access boundaries

- [ ] **Step 1: Add initial schema migrations for events, registrations, member profiles, recaps, FAQs, media references, and partner inquiries.**
- [ ] **Step 2: Add Supabase client/server adapters and environment documentation that keep the app runnable without committed secrets.**
- [ ] **Step 3: Implement email-based member entry, profile editing, and member registration history surfaces.**
- [ ] **Step 4: Associate authenticated registrations with member profiles while preserving visitor registration support.**
- [ ] **Step 5: Verify profile and history behavior with focused tests and build checks.**

## Task 5: Build Recaps, FAQ, And Partner Inquiry Surfaces

**Files:**
- Create/modify: `src/lib/recaps/*`, `src/lib/faqs/*`, `src/lib/inquiries/*`
- Create/modify: public recap, FAQ, about/contact, and partner inquiry routes/components
- Test: bilingual publish and inquiry validation behavior

- [ ] **Step 1: Add public recap index/detail rendering with media-aware layouts and tagged recap metadata.**
- [ ] **Step 2: Add FAQ/new-rider guidance and lightweight brand/contact content using the reduced migration scope.**
- [ ] **Step 3: Add partner inquiry and activity interest capture forms with server-side validation.**
- [ ] **Step 4: Enforce language completeness rules for published bilingual public records.**
- [ ] **Step 5: Verify responsive public route rendering and validation tests.**

## Task 6: Build Staff Admin Operations

**Files:**
- Create/modify: `src/app/admin/*`, `src/components/admin/*`
- Create/modify: admin repositories/actions under `src/lib`
- Test: staff gate, content state transitions, registration export behavior

- [ ] **Step 1: Add staff-only admin route protection and a clear unauthorized path.**
- [ ] **Step 2: Build event and recap management surfaces for drafts, publish state, registration window state, bilingual content, and media references.**
- [ ] **Step 3: Build registration management with per-event filtering, status update, member linkage visibility, and CSV export.**
- [ ] **Step 4: Add FAQ/media/inquiry administration at the minimum level needed for first-release operations.**
- [ ] **Step 5: Verify admin authorization and core workflows with focused tests.**

## Task 7: Polish, Verify, And Hand Off

**Files:**
- Modify: site styling, README/env docs, tests as needed

- [ ] **Step 1: Tighten activity-focused responsive layouts, accessibility labels, loading/empty/error states, and bilingual navigation behavior.**
- [ ] **Step 2: Document local setup, environment variables, Supabase migration steps, staff bootstrap assumptions, and deployment checks.**
- [ ] **Step 3: Run the full lint, test, and production build commands.**
- [ ] **Step 4: Run browser verification for homepage, event detail, visitor registration, member profile/history, recap browsing, and admin access boundaries.**

## Acceptance Coverage

- Public visitors can discover current activities and browse past SnowForce recaps.
- Visitor registration stays on-site and handles event state, field validation,
  consent, confirmation, and notification failures safely.
- Email members can maintain reusable profile data and view registration history.
- Staff can manage first-release content and registration operations from one
  admin surface.
- The app is structured so payments, waitlists, member benefits, and richer
  analytics can be added without replacing the event and registration domain.
