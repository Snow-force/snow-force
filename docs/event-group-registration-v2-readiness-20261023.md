# Event group registration V2 — implementation and production readiness

Date: 2026-10-23, America/Los_Angeles. This records code and isolated acceptance, **not a production release**.

## Scope and confirmed rules

Implements P0 from [the V2 plan](event-group-registration-waiver-v2.md). A verified member can add themselves, friends, or friends only in one booking; each participant keeps an independent pending registration, payment, approval, waiver and ticket. Existing per-event friend caps remain authoritative (currently five); the booker does not consume a place unless attending. P1 consolidated Checkout, payment allocation and partial group refund ledgers remain deferred.

Adult attendees must use their own email; a participant under 18 on the event's local calendar date needs the parent/legal guardian's name, relationship and email. The server and database derive the required role; changing the client role cannot bypass it. A guardian may sign separate documents for siblings and gains no attendee place. Guardian authority and candidate identity duplicates need explicit staff verification before entry. A mailbox verification alone does not establish legal guardianship.

Each person pays independently. Unpaid, unsigned, declined, bounced and unapproved states remain distinct and visible. Cancellation, rejection and signature refusal never automatically refund money. Support and reply-to use **hello@snow-force.com**.

## Delivered behavior

- Atomic multi-person holds, stable request recovery, one self place, existing capacity lock and friend cap, individual coupons and the existing Stripe payment writer. Canonical verified Auth member identities prevent duplicate usable tickets across bookers. Similar guest name/DOB signals cause review; shared family email alone never blocks siblings. This does not claim perfect identity detection for unverified guests.
- Event-specific, versioned adult and guardian policies with staff approval; blank until reviewed terms are supplied. No new default legal text is treated as approved. Future default legacy templates no longer include a bundled media grant; persisted historical terms/signatures are retained.
- Encrypted durable outbox, strict provider success, stable idempotency, concurrent worker leases, bounded backoff, invitation/address rotation and daily unsigned reminders through the event day in its configured time zone. Failed delivery is visible, never reported as delivered. Provider delivery/bounce events require real signature verification and are deduplicated; an early callback retries until its message ID is recorded.
- Private links use a URL fragment, so tokens are absent from server URL paths/referrers. Private server actions use FormData; local Next logs were checked for both raw capabilities and birth dates. Email OTPs are hashed, throttled and short-lived; signing proof is generation-bound, single-use and held in an httpOnly cookie. The payer's signature cannot satisfy an adult friend's assignment.
- Immutable individual signature/legal snapshots, constrained guardian names and roles, and separate payment/approval/signature entry gates. Policy changes retain historical evidence and require a new signature. Event date changes stop new V2 enrollment and require staff handling of new age details; staff cannot accept evidence for the old date.
- Member booking management and staff review/revoke/reissue/check-in controls. DOB, raw signer email and evidence are excluded from member views/tickets and existing registration exports. All nine new tables have RLS and deny anonymous/member Data API access; privileged RPCs grant execute only to service_role and none use public security-definer functions.
- V1 records keep their existing handling. A V1 pending payment created before V2 enrollment can still fulfill after enrollment; new V1 submissions are blocked for enrolled events. Disabling V2 stops new bookings while preserving already-created V2 payment/signature processing.

## Verification

Validated with Node 24.22.1, the installed Next.js 16.3.8, disposable PostgreSQL/PostgREST, the real Next form/action boundary, and an independent temporary Stripe Sandbox. No production database writes, production deployments, real charges or real waiver/OTP recipient emails were made.

| Check | Result |
|---|---|
| `npm test` | 214 files / 1,381 tests passed, no unexpected console output |
| `npm run build` | ESLint, production compile and TypeScript passed without warnings |
| `npm run test:coverage` | 1,381 passed; total line coverage 65.01%; new email adapter 100%, secrets 100%, Auth identity resolver 100%, delivery worker 90.38%, restricted repository 96.36%, webhook route 100% |
| `node scripts/test-event-proxy-registration.mjs --v2` | 16 acceptance groups; V1 + V2 database assertions, including in-flight V1 fulfillment, guardian siblings, code lockout, wrong-role/replayed proof, immutable evidence, last-seat races, unknown payment holds, policy changes, cancellation finances, concurrent email leases, delivery replay and all nine tables' access controls |
| `node scripts/test-event-proxy-registration.mjs --v2 --web` | Real local multi-person form → DB, adult/guardian OTP → proof retained on refresh → signature → staff/approval-gated ticket; EN/ZH and mobile/desktop; all three current payment/approval combinations; no raw token/DOB in Next logs, no page errors or mobile overflow |
| `node scripts/test-event-proxy-registration.mjs --v2 --stripe` | Two separate hosted Checkout sessions on desktop/mobile, same-person retry resumes its session, synthetic card payments, signed local webhook replay, separate unsigned assignments, no inherited payer signature, both test payments fully refunded |

Vitest coverage does not include SQL execution; the disposable database suite is the evidence for database constraints, concurrency and grants. Remaining uncovered branches include infrastructure failures and legacy payment/refund paths; no coverage checks were lowered. Existing payment behavior is additionally exercised with real Sandbox Checkout/webhooks/refunds.

The existing shared Stripe test environment had an external webhook, so the runner refused to use it. Acceptance used an independent temporary claimable Sandbox with no external webhooks and no production callbacks. Its credentials/claim URL remain in ignored local tooling state and are absent from source and this record; it expires after seven days. Real email delivery and real guardian/legal review still require approved staging recipients and operations review.

Local screenshot evidence is under the original workspace's `output/event-group-registration-v2/` (test identities only). The acceptance harness needs the existing ignored PostgreSQL/PostgREST/browser tooling; `EVENT_TEST_APP_ROOT` can point it at the managed worktree. It refuses live Stripe keys and external Sandbox webhooks. Keep secrets out of command output.

## Production release gate

The migration `20261024035754_event_group_waiver_v2.sql` is **not applied to production**. New event flags default false. No production secrets, callbacks, schedulers, activity parameters or Railway deployment were changed. Railway continues to follow GitHub `main`; this feature branch must not merge before release approval. Do not accept unrelated staged Railway changes as part of this release.

Before production activation, operations must approve the event-specific adult and guardian text, guardian/identity verification procedure, minimum participation age, DOB/child-data retention and permitted staff access. This implementation restricts sensitive data and preserves evidence; it does not invent a retention/deletion period or decide legal enforceability.

Approved release sequence:

1. Confirm production migration history/schema and backups; apply only this reviewed expansion after the existing V1/coupon/approval migrations. Rehearse the migration on a current nonproduction snapshot first. Do not replay or rename already-recorded V1 migration versions.
2. Configure a fresh dedicated 32-byte AES key (`EVENT_WAIVER_ENCRYPTION_KEY`, 64 hex), a separate random worker bearer (`EVENT_WAIVER_WORKER_SECRET`, at least 32 characters), the existing verified Resend sender/API key, and a Resend webhook secret (`RESEND_WAIVER_WEBHOOK_SECRET`). Keep encryption keys available for outstanding encrypted jobs; do not rotate by discarding them.
3. Configure signed Resend delivery/bounce/complaint/failure events to `POST /api/resend/waivers`; use the secret from that exact endpoint. Turn off open/click tracking for private links. Never log request bodies, OTPs or fragment tokens in monitoring.
4. Configure a recovery task every minute to call `POST /api/events/waivers/dispatch` with `Authorization: Bearer <worker secret>`; store the bearer as a scheduler secret, not in a query parameter. It processes a bounded batch and retries durably. The immediate `after()` callback supplements, rather than replaces, this task.
5. Deploy approved code from main with event flags still off. Smoke-test existing V1 read/payment/signing/approval/refund routes. Verify the actual revision, Railway source remains main with no commit pin, and production health. Preserve unrelated staged changes.
6. Using separately approved internal adult/minor/guardian recipient accounts, validate actual invitation → provider delivery → OTP → personal signature → guardian/identity review → approval → ticket/check-in. Verify failure/bounce visibility and reminder recovery. Authorize any live financial test separately; Sandbox results do not authorize a real charge.
7. In `/admin/events/<slug>/waivers`, save reviewed separate texts/time zone, then enable group form + mandatory emailed waiver only for approved events. The current paid configurations are supported: MetroSlopes full prepay 118 with approval; Mammoth Opening deposit 99 with approval; Thanksgiving deposit 99 without approval. Do not alter their friend caps, prices or approvals implicitly.
8. Watch unsent/retrying/bounced mail, unsigned/declined waivers, pending guardian reviews/approvals, paid_requires_review places and seat totals. Assign staff ownership of follow-up/refunds; there is no automatic refund job.

Safe rollback: disable the two enrollment flags together (the staff policy form does this). Retain the expanded schema, V2-aware application, email recovery worker, existing assignments and signature evidence. Existing V2 orders still need fulfillment/signing/refund handling. Do not delete tables or restore a binary that cannot interpret V2 while accepting payments.

The plan's release requirement remains: **“所有生产写入、试扣款和真实邮箱通知均需要独立上线审批。”** Code acceptance here does not substitute for that approval or for reviewed legal text.

## Release decision — 2026-10-24

The user explicitly chose **“暂不部署，补齐审定文本后再上线”**. Keep [PR #42](https://github.com/Snow-force/snow-force/pull/42) as a draft; do not merge to main, apply the production migration, change production variables, send real waiver/OTP emails or enroll events until that release hold is lifted. The approved business defaults do not approve legal text or a data-retention period.

Read-only follow-up confirmed the source revision passed GitHub Quality Gate and the PR had no merge conflicts. Production web remained online with one healthy replica and no recent failures; the V2 tables/flags were absent. All three open events still allowed five friends and retained their existing payment/approval models. The unrelated staged Railway region/shop configuration remained untouched.

To resume activation, obtain reviewed event-specific adult and parent/legal guardian text, the minimum-age/guardian verification procedure and child-data retention/access rules, then request approval for the concrete production release and designated internal recipient tests. No deployment or activation was performed in this follow-up.
