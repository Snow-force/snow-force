# Lodging local continuation — 2026-11-04

## Synced baseline

- Cloud conversation: `6aea8928-7eac-83e8-97ee-490633a0803b` (详细更新计划).
- Draft PR: https://github.com/Snow-force/snow-force/pull/48
- Cloud branch: `feature/event-lodging-catalog-20261104`, commit `f8515fc3046c33736f0466308e7de654242956c2`.
- Local continuation branch: `codex/event-lodging-inventory`.
- Full source plan: [event-lodging-update-plan-v1.md](event-lodging-update-plan-v1.md).
- First batch: [event-lodging-catalog-implementation.md](event-lodging-catalog-implementation.md).

The pre-sync local main checkout had uncommitted registration changes and acceptance
artifacts. They are retained in Git stash `local-before-lodging-sync-20261104`;
the stash was applied without dropping the backup. Registration source/test changes
and most script changes were already included upstream. Three conflicts used the
newer upstream acceptance dates/results and tooling-root support. Older untracked
files that became tracked upstream were kept at their upstream versions; their
original local versions remain in the stash's untracked-files commit.

## New inventory foundation (part of plan PR 2)

`20261105035034_event_lodging_inventory.sql` adds internal confirmed supply units,
date-specific supply/stop-sale rows and audited inventory holds. Operators must
provide a confirmed supply reference and continuity guarantee; internal unit codes
are not hotel room numbers. No assumed hotel inventory is seeded.

- `reserve_lodging_inventory` locks the room-type pool and allocates entire units
  for every night in `[check_in, check_out)`. Multiple events and manual allocations
  share the same supply. Requests of up to ten units and thirty nights are atomic.
- Request keys are scoped to the initiating actor. Retries return the same hold;
  changed request parameters fail. Retrying a released hold returns its original ID
  and does not reserve inventory again; a fresh attempt requires a new key.
- Temporary internal holds have a ten-minute pre-Checkout expiry. Manual allocations
  have no expiry. Expired rows continue consuming supply until explicitly released.
- `release_lodging_inventory` releases manual holds, expired pre-Checkout holds, or
  holds recorded as authoritatively terminal-unpaid. Creating/open/processing/unknown/
  paid states cannot be freed. Releases preserve request identity and record actor,
  reason, previous state and changed room nights in the private audit log.
- Supply mutation triggers use the same room-type lock. Occupied nights cannot be
  removed, blocked, reassigned or cleared while their hold is active. Unit/date
  identities cannot be moved through an update.
- New tables have RLS and no public/member grants. Commands use SECURITY INVOKER,
  an empty search path and service-role-only execution. No new public action exposes
  the internal RPCs. Future server commands must enforce staff/member authorization
  before privileged calls.

## Verification

Use the project-required Node version (`>=24.22.1 <25`). The machine's default Node
was 24.21.0; verification uses `npx --yes --package=node@24.22.1 -- ...` without
changing global tooling or the project's dependency versions.

```powershell
npx --yes --package=node@24.22.1 -- npm test
npx --yes --package=node@24.22.1 -- npm run test:coverage
npx --yes --package=node@24.22.1 -- npm run build
npx --yes --package=node@24.22.1 -- node scripts/test-lodging-inventory.mjs
```

The focused embedded-PostgreSQL suite covers local date/DST behavior, fragmented
supply, atomic failure, shared/manual allocations, idempotency, safe expiry,
payment uncertainty, audit records, service-role execution and access denial.
The separate acceptance script starts and stops an isolated localhost PostgreSQL
cluster, exercises twelve simultaneous clients, and writes
`output/lodging-inventory-acceptance.json`. It uses the existing local PostgreSQL
tooling and commerce `pg` test dependency; `LODGING_TEST_PG_BIN` can override the
binary directory. It never loads `.env.local` or connects to a hosted database.

Verified locally on 2026-11-04:

- `npm test`: 229 files / 1,495 tests passed, including 27 new inventory tests.
- `npm run test:coverage`: all 1,495 tests passed. Overall line coverage 65.59%;
  existing lodging TypeScript line coverage 100%, branch coverage 81.39%.
- `npm run build`: lint, compilation, TypeScript and production build passed with
  no warnings. No concurrent project Next process was running during the build.
- Real PostgreSQL acceptance: all five groups passed, including twelve concurrent
  cross-event/manual contenders, concurrent idempotent retries, payment/release
  locking, supply-reduction locking and private access/sales constraints.

V8 coverage does not measure SQL. Inventory behavior is verified by the embedded
PostgreSQL suite and the independent multi-connection PostgreSQL acceptance.
The report also exposes existing coverage gaps: the `/admin/lodging` route wrapper
has no direct coverage, and the payment module has 63.14% branch coverage (75.42%
line coverage). These are not new payment implementations in this batch. Add
focused authorization, uncertain-payment, fulfillment and refund tests when the
following batches wire these surfaces to lodging; do not treat a green coverage
command as payment end-to-end approval.

## Remaining before PR 2 is complete

This is the inventory engine, not a completed booking product. Next implement the
staff contract/supply editor, calendar and manual-allocation UI, server-authorized
commands, availability presentation, and the payment reconciliation integration.
Contract dates, return deadlines, costs, sales limits and occupancy checks are not
implemented by these internal primitives. The next batch must validate them before
calling the reserve RPC for a customer.

Payment creation/recovery must take the same room-type lock, re-read the hold and
prevent restarting a released hold before recording its attempt. Stripe calls run
outside database transactions. No cleanup worker should mark `unpaid_terminal`
without authoritative Stripe evidence. Confirmed payment fulfillment, late-paid
review, cancellation approval and refunds remain separate future work; callers
must not use the internal release command as a customer cancellation endpoint.

No production migration, deployment, runtime flag, customer payment or notification
has been triggered. The original database constraint still prohibits enabling
lodging sales. Do not apply the new migration in production until its operational
interfaces and full payment/cancellation flows have passed acceptance.
