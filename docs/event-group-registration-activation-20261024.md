# V2 activation preparation — 2026-10-24

The user requested “配置 v2” after authorizing deployment. This record distinguishes infrastructure preparation from opening public V2 bookings.

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
