# Event cancellation approval

Member cancellation requests retain the registration and its capacity until an admin approves. A cancellation decision, a Stripe refund and financial settlement are independent facts.

## Operations

1. Member: Trips → Cancellation requests and refunds → Request cancellation → enter reason → Submit for approval. The member can withdraw while pending. Issued self and friend places each have an independent request. Unpaid holds with no active checkout can still be discarded after confirmation.
2. Admin: Registrations → Cancellation requests. Review the participant, paid amount and existing refunds. Decide approve/reject, enter a reason and the approved refund amount (zero means no refund). Managers can view but cannot decide or execute refunds.
3. Approval releases capacity. For a refund, separately type REFUND and execute the saved approved operation. The amount and operation ID are read from the server; a browser cannot substitute them. Unknown network outcomes reuse that operation, never a fresh refund.
4. Stripe callbacks determine actual refund status and totals. Failed, cancelled and requires-action outcomes remain visible for manual review. Settlement is not automatically marked completed by a refund.
5. Stripe refunds created outside this approval flow synchronize money and appear as external refunds requiring review. They do not automatically cancel an active registration.
6. Existing cancelled records remain cancelled. No historical seats are restored and no live payment is refunded by the deployment.

## Reliability and access

- Server-only request/mail tables have RLS enabled and browser grants revoked. RPCs are invoker functions restricted to service_role. Actions authenticate members or admins, and RPCs recheck ownership or staff role.
- A partial unique index permits one pending cancellation per participant. Review locks the registration then request, writes the decision and cancellation in one transaction, and rejects duplicate/replayed reviews. One in-flight refund per participant prevents different concurrent operations.
- Member and staff notification events are durable. Transactional email is stored in an outbox, claimed with SKIP LOCKED, sent with a stable Resend idempotency key, and retried with backoff. Recovery runs through the existing authenticated waiver dispatch worker. Failed email does not change cancellation/payment results.
- The previous issued-place cancellation RPC now refuses the operation, including requests from stale clients.
- Admin direct cancellation requires CANCEL plus a reason. An existing pending request must be reviewed through the queue first.

## Rollout

Run the full tests, coverage and production build. Apply `20261103182503_event_cancellation_approval.sql` before publishing the source. This additive migration blocks the old member immediate-cancel path without rewriting registrations. Deploy the website from the same GitHub source. Verify grants, RPC behavior in rollback-only transactions, and HTTP health after deployment. Do not include unrelated Railway staged configuration changes.

## Verification

The PGlite database suite executes the actual migration and checks request deduplication, ownership, policy gating, withdrawal/rejection, admin approval, stale RPC denial, permissions, unpaid checkout protection and durable mail claims. Action/UI tests cover authenticated identity, explicit confirmation and server-owned refund amounts. Existing payment/webhook tests cover refunds and reconciliation. No test calls live Stripe refund APIs.

## Follow-up: legacy rejection and timeout recovery

Attendance rejection in both the V1 guest controls and V2 waiver controls no longer cancels a place. The UI links to registration management, stale server actions are denied or redirected, and both database RPCs reject cancellation operations for every caller, including admins. Staff attendance approval and waiver/check-in operations remain available. Admins cancel only through the central audited cancellation controls.

Refund retry first retrieves its saved Stripe refund ID or pages through the payment's refund history using the saved operation ID in metadata. A matching payment, currency and amount is reconciled before checking the remaining refundable balance. This repairs a refund that actually succeeded despite a lost response or delayed webhook. If no result exists, retries reuse the original actor, reason and idempotency key only within a conservative 23-hour window; expired, failed, mismatched or unverified operations require manual review. Recovery tests use mocked Stripe calls and never refund production payments.
