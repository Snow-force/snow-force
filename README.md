# SnowForce Activity Platform

Bilingual (EN/ZH) snow sports community platform built with Next.js, TypeScript, and Tailwind CSS. Ready for Supabase integration.

## Quick Start

```bash
npm install
npm run dev
```

Registrations and inquiries retain workspace-local fallback records where their
repositories still use `.data/`. Event administration now expects Supabase so
staff edits persist outside frontend code.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── admin/              # Staff admin panel behind server-side session checks
│   ├── events/             # Public event listing & detail
│   ├── recaps/             # Past event recaps
│   ├── faq/                # Frequently asked questions
│   ├── about/              # About & contact
│   ├── partner/            # Partner inquiry form
│   └── member/             # Lightweight member profiles
├── components/             # Shared UI components
│   ├── site/               # Nav, Footer
│   ├── events/             # Registration form
│   └── admin/              # Admin navigation
└── lib/                    # Domain logic & adapters
    ├── events/             # Event types, seed data, repository
    ├── registrations/      # Registration validation & server actions
    ├── members/            # Member profile repository
    ├── recaps/             # Recap repository
    ├── faqs/               # FAQ repository
    ├── inquiries/          # Partner inquiry repository
    ├── email/              # Email adapter (console fallback)
    └── supabase/           # Supabase client placeholder
supabase/
└── migrations/             # Database schema migrations
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in values for production.

## Supabase Setup

1. Create a Supabase project.
2. Run the migration in `supabase/migrations/20260521231915_initial_schema.sql`.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. Set `SUPABASE_SECRET_KEY` for server-only admin event writes while staff
   access continues to use the local password session.
5. Keep the secret key out of browser code and out of any `NEXT_PUBLIC_`
   variable.

The `events` table is the operational content source for public activity pages.
The public RLS policy exposes only published events. The event admin writes
through server actions after `/staff-login` authentication and uses the
server-only Supabase key for draft and update operations.

## Stripe Setup

1. Create a Stripe account (US/HK/SG/etc.).
2. Get your secret key + publishable key from Stripe Dashboard → Developers → API keys.
3. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL` in `.env.local`.
4. For local development, install the Stripe CLI and run:
   ```bash
   stripe listen --forward-to http://localhost:3000/api/stripe/webhook
   ```
5. Configure the production webhook endpoint at `/api/stripe/webhook` in the Stripe Dashboard (Developers → Webhooks → Add endpoint). Use the `checkout.session.completed` event.

## Event Workflow

Open `/staff-login`, then use `/admin/events`.

- Create a draft from **New Event**.
- Edit bilingual activity details, schedule, registration fields, and SEO in the
  event editor.
- Keep cover images as URLs or app-relative paths for this version.
- Publish only after required bilingual and operational fields are complete.
- Open or close registration from the event list.
- Choose a payment model (Free / Deposit / Full prepay) in the registration settings step. Deposit and Full prepay events require Stripe Checkout for online payment.

Existing examples in `src/lib/events/seed.ts` are import/reference data. Insert
those records into Supabase once before relying on the admin workflow; after
that, day-to-day activity updates belong in the event editor instead of code.

## Staff Admin

Access at `/staff-login`. Set `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`
before using the admin routes.

Admin and member profile sessions use signed httpOnly cookies for the local
fallback app. In production, use Supabase Auth with the `staff_roles` table for
staff access control, and keep public registration/inquiry writes behind server
commands so field validation and spam controls cannot be bypassed.

See the bilingual [Admin operations desk guide](docs/admin-operations-desk.md) for interactive workflow guidance, daily triage, payment follow-up, partner conversations, and shift handoffs.

## Commands

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run lint      # Run ESLint
npm test          # Run Vitest
```
