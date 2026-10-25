# V2 activation preparation — 2026-10-24

**Latest status — 2026-10-25:** [V2 is enabled on all three current open activities](event-group-registration-enabled-20261025.md) following the operator's explicit “开启”. The preparation/default-off descriptions below are historical.

The user requested “配置 v2” after authorizing deployment. This record distinguishes infrastructure preparation from opening public V2 bookings.

Later clarification: [age confirmation at waiver signing](event-waiver-age-confirmation-20261024.md) replaces birth-date collection/role derivation for new bookings. An explicit 18+ checkbox permits adult signing without a guardian; under-18 guardian signing and under-14 accompaniment remain. Historical birthday-based descriptions below document the preceding release.

## Current event scope

| Event | Local start date | Payment | Staff approval | Target time zone |
|---|---|---|---|---|
| metroslopes-indoor-ski-snowboard-1107 | 2026-11-07 | Full prepay USD 118 | Required | America/Los_Angeles |
| mammoth-opening-weekend-2026 | 2026-11-13 | Deposit USD 99 | Required | America/Los_Angeles |
| mammoth-thanksgiving-trip-2026 | 2026-11-26 | Deposit USD 99 | Not required | America/Los_Angeles |

All three locations were verified as California. Existing prices, capacity, approval settings and the five-friend limit are preserved. Each participant retains an independent payment, waiver, approval and ticket. Support remains hello@snow-force.com.

## New safeguards

- There is no uniform minimum participation age. Under 18 on the event's local date requires a parent/legal guardian signature. An attendee who becomes 18 by the event must wait until actually 18 to sign adult terms; both server and SQL enforce this.
- Birth dates cannot be in the future. Date-only age comparisons preserve leap-day behavior. Birth dates are used only on the server for invitation eligibility and do not appear in ticket responses or member booking views.
- Under 14 requires the accompanying parent/legal guardian's name, phone, legal relationship and an explicit commitment to stay throughout. Staff verify presence separately from signature authority and approval. SQL blocks check-in without verified accompaniment. Recording departure clears attendance and blocks re-entry until presence is verified again; staff must stop the child's participation when the guardian leaves.
- Accompaniment data is restricted to the service role with RLS enabled. No anonymous/member grants or public security-definer functions are introduced.
- The private waiver page identifies the event, local date, location and attendee. Signed terms can be opened and printed/saved; printing expands the complete recorded terms first.
- Resend messages carry the `event-waiver-v2` stream tag. Both webhook routes verify provider signatures before routing. The waiver callback acknowledges unrelated mail without retrying it forever; marketing ignores the waiver stream. Early callbacks for genuine waiver messages still retry until the outbox acknowledgement is stored.
- The privacy notice explains parent-managed child registrations, required data and the confirmed age rules. This does not claim blanket compliance with children's privacy laws or substitute email verification for guardian authority.

## Infrastructure

- Existing verified sender: notifications.snow-force.com; open/click tracking disabled.
- Dedicated signed callback: `https://snow-force.com/api/resend/waivers`, for delivered, bounced, complained and failed events. Provider webhook ID: `857732c1-04ef-4e51-aa0c-7861004be30b`.
- Fresh dedicated encryption and worker secrets plus the callback secret were configured on the production web service, without printing credentials or redeploying unrelated services.
- Dedicated Railway Function `event-waiver-recovery-v2`, service `6940a680-f5b9-4b6f-9e7e-f931223029a3`. Its source is [the bounded recovery script](../scripts/railway-event-waiver-worker.mjs). It sends authenticated POST requests, exits after completion and never logs credentials or response bodies.
- Recovery schedule: every five minutes, Railway's documented minimum. Immediate Next `after()` delivery remains the normal path. Five-minute recovery is a documented change from the plan's proposed one-minute schedule; scheduling is not an exact-time delivery guarantee. [Railway cron documentation](https://docs.railway.com/cron-jobs).
- The unrelated staged Railway region/shop patch is preserved. Do not apply the environment-wide staged changes as part of this release.

## Verification

Isolated PostgreSQL and real local browser acceptance passed: friends-only adult/child booking, all three current payment/approval combinations, independent OTP/signatures, authority review, presence/departure checks, approval-gated tickets, private DOB handling, stable proof across refresh, replay protection, capacity/coupon behavior and legacy compatibility. No production payments or customer emails were used.

Full tests, coverage and production build are required before committing/deploying this change. The final release verification below records the actual results.

## Remaining activation inputs

The operator has not yet specified separate retention periods for original birth dates, guardian contact details and signature evidence, nor an authorized internal email recipient for a real invitation/OTP delivery test. These are requested in the pending question. No retention period is invented.

The adult and guardian files in [the waiver draft directory](event-waivers-20261024/REVIEW-NOTES.txt) remain historical review drafts. This work does not certify lawyer approval or silently relabel them as legally approved policies. Public activation still needs the adopted terms, retention/access/deletion rules and the designated internal delivery acceptance.

Until those inputs and acceptance are complete, keep both V2 enrollment flags false and preserve existing V1 bookings. Do not interpret configured keys, deployed code or a successful empty queue run as proof that the three public events are enabled.

## Verified production configuration release

- `npm test`: 216 files / 1,390 tests passed. `npm run test:coverage`: passed, total lines 65.20%; waiver callback 100% lines, participant validation 100% lines, staff actions 100% lines. The private ticket action is covered for both missing/present accompaniment and excluding DOB from browser responses. Remaining action coverage includes legacy management/error paths; isolated SQL/browser acceptance supplements unit coverage for payment and signing boundaries.
- `npm run build`: ESLint, production compilation and TypeScript passed without warnings. The real local browser acceptance passed across all three current payment/approval combinations, with no external sends or production writes.
- [PR #43](https://github.com/Snow-force/snow-force/pull/43) source `7262226d23b3e347cd3ffe280d00146d7ebfd467` passed [GitHub Quality Gate run 105](https://github.com/Snow-force/snow-force/actions/runs/40165736141) before merge. Main application revision: `d1164694ccb5f808f39ba2caea650808336499d1`.
- Migration `event_v2_accompaniment_activation` was applied as remote version **20261025052926**. The local file is `20261025050952_event_v2_accompaniment_activation.sql`; do not replay it under the local version. Read-back confirmed RLS, no anonymous/member reads, no public waiver security-definer functions and zero enabled V2 events/bookings.
- Production web deployment **c25f6ffc-0606-40ee-92e0-a0884d6c1396**: SUCCESS, source main revision above, actual region **sfo**. Its specific contributor deployment was approved; the unrelated environment patch was not applied. The dashboard's region widget reflects staged configuration and is not evidence that the runtime moved to US East.
- Recovery Function deployment **a0ec5472-5170-4c1c-b308-5416a5770292**: SUCCESS / cron ready, zero recent failures. Its authenticated dispatch returned HTTP 200 at `2026-10-25T05:42:29Z`; structured runtime attributes reported `sent=0`, `failed=0`. The five-minute schedule and exit-on-completion policy are configured. An empty queue check proves connectivity/authentication, not real recipient delivery.
- [Production smoke evidence](../output/event-v2-activation-preparation-smoke-20261024.json), verified `2026-10-25T05:42:30Z`: health, all three event pages, private waiver entry, legacy invalid invitation and privacy notice returned 200; unauthenticated dispatch returned 401; unsigned provider callback returned 400. Three-event payment/approval/cap values were unchanged and both V2 flags remained false. No real bookings, payments or waiver emails were created.
- [Deployment screenshot](../output/event-v2-configuration-deployed-20261024.jpg).
- Existing security advisor categories remained unchanged. Server-only RLS tables intentionally have no member policies: [Supabase RLS advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). The pre-existing leaked-password-protection warning was not introduced or changed by this release: [Supabase password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Unrelated staged patch `b2de2a43-2321-441f-91c2-d7a0550ff591` still contains the same three region/shop field changes and retains its original update timestamp. No environment-wide acceptance was performed.
