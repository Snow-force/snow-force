# Fixed per-person activity packages

The user confirmed on 2026-11-05 (America/Los_Angeles): multi-day activities offer
room-type choices at different **fixed activity package prices per person,
including lodging**. Staff arrange roommates. Guests need not register in complete
room groups, and actual occupancy does not change an individual's package price.
This supersedes the original whole-unit separate-checkout proposal.

## Draft preparation implemented

- Saved activities have an “活动房型套餐 / Room-type activity packages” section
  below the event editor. Registration settings link to it; new activities must
  first be saved. Hotel and room-type reference data remain reusable.
- Each event/room/date offer has an explicit nullable `package_amount`, in USD
  cents. Staff enter dollars with up to two decimal places. New UI forms require
  a positive package price; old drafts remain unpriced until staff fill one in.
  No hotel cost is automatically converted to a selling price.
- Package prices include the activity and lodging. Hotel nightly costs, fees and
  draft taxes are labeled internal estimates and are not added to the package.
- The staff preview calculates `per-person package amount × people`. USD 399.00
  remains USD 399.00 for one person and USD 1,197.00 for three, regardless of the
  room's maximum guest count. Legacy unpriced offers cannot be selected in preview.
- Privileged reads require staff authorization and filter offers by the current
  event. Staff saves retain version comparison and audit attribution, refresh both
  lodging administration and the affected event editor, and reject forged sales
  activation fields. Package forms are siblings of the event editor form, avoiding
  nested forms and accidental event submission.

Migration: `20261106031532_event_lodging_per_person_package.sql`, created using the
installed Supabase CLI. The filename reflects the execution host's UTC clock;
the business decision date above follows the user's timezone. The migration adds
one nullable bounded integer column, with no backfill, grants or policy changes.

## Validation and rollout boundary

Focused tests cover exact decimal conversion, invalid prices, legacy drafts,
fixed per-person totals, event-scoped reads/forms, staff authorization, save
invalidation, audit data, database constraints and direct client denial.
The isolated hosted Supabase project `mcshlplkqbftsiwqgvva` accepted the migration.
A transaction created synthetic event/hotel/room/package rows, verified 39900
cents per person, 119700 cents for three, `sales_enabled=false` and denied
anonymous reads/member writes, then rolled back. Follow-up counts verified zero
synthetic event and offer rows. Security advisors reported informational private
RLS tables and no warning/error on the isolated project.

The same additive migration was applied to production Supabase
`bhmwxkynhyhquspiyact`. Before/after checks retained 12 events, 300 registrations,
zero lodging offers and zero enabled sales. The new column is an integer;
anonymous reads and member writes remain denied. Security advisor totals remain
49 private-table informational entries and the pre-existing leaked-password
protection warning; no new warning was introduced. No production fixtures or
customer pricing were created or changed.

React review: privileged imports stay server-side, server reads run in parallel,
form controls have labels, live statuses are announced, there are no effects or
client-side data requests, and version keys refresh uncontrolled form values.
The new activity section follows the root bilingual provider.

Full validation passed: 1,523 tests in 231 files, `npm run build` (lint,
TypeScript and production build), and `npm run test:coverage` (the same 1,523
tests). Overall line coverage is 65.77%. Final test/build logs contained no
unexpected stderr, React act warnings or build warnings. No dependency changed.
Lodging domain line coverage is 100% (branches 92.53%); the remaining repository
branches are existing configuration fallbacks. Payment branch coverage remains
63.14%, unchanged; customer package checkout is still outside this batch.

## Production release

Published commit `1667cfc803e1da1eb8166ac952be49ae92c5dc12` to the existing Railway
web service, deployment `9c2b5704-5a53-42ee-8c5e-7c59cf9bbd67`, which reached
SUCCESS and passed its healthcheck in the unchanged `us-east4-eqdc4a` region.
The service remains pinned to that reviewed commit. Previous successful
deployment `fcd68d8e-c6dd-4d50-9c14-3ff9a9fab0ee` remains the web rollback target;
keep the nullable additive column if rolling back. No environment-wide staged
changes were accepted and no secrets, DNS, worker or commerce configuration changed.

Post-release domain checks passed for health, home, events, member and shop
(HTTP 200). Event/lodging administration redirect anonymous visitors to staff
login (307); public `/lodging` stays unavailable (404). Evidence is in
`output/lodging-package-production-smoke-20261105.json`. Production checks were
anonymous and read-only; no existing staff identity was impersonated and no
live catalog edit, payment, refund or email was generated.

Cloud installation repeated existing deprecation notices for `whatwg-encoding`,
`tsconfck` and `eslint`, plus the previously reviewed `unrs-resolver` install-script
policy notice. The resolver's postinstall delegates native preparation to
`napi-postinstall`; see the earlier preview report. No blanket install-script
approval or warning suppression was added. Cloud lint, compilation, TypeScript
and startup checks passed.

This is **staff draft configuration and preview**, not customer package sales.
Public activity, registration and payment behavior are unchanged; the database
still forbids `sales_enabled=true`. Before enabling the customer flow, implement
per-person room-type capacity/holds tied to hotel supply, required selection for
every participant, server-side quote validation and immutable price snapshots,
coupon calculations from that quote, payment reconciliation, cancellation and
refund release. Preserve existing individual waivers and participant payments.
Do not expose hotel costs or draft policies through a public catalog query.
