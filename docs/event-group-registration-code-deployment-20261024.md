# Event registration V2 — default-off code deployment

Date: 2026-10-24, America/Los_Angeles.

Status: **production code deployment SUCCESS**, verified 2026-10-24 at 16:52 PDT (23:52 UTC). This is a code-only release. **All V2 event flags remain off; V2 activation is excluded.**

## Authorized scope

The user's “部署” authorizes deployment from main with every V2 event flag off. It supersedes the earlier code-deployment hold, while the unapproved adult/guardian drafts, under-14 parent-accompaniment enforcement, signing-day adult eligibility, per-state review and child-data retention remain activation gates. No real waiver/OTP recipient test, charge, refund or V2 enrollment is authorized or performed by this release.

## Verification before release

- `npm test`: 214 files / 1,381 tests passed.
- `npm run test:coverage`: passed; total line coverage 65.01%.
- `npm run build`: ESLint, production compilation and TypeScript passed without warnings.
- The slow-machine group-form test was stabilized by pasting name/email fields instead of producing a separate keystroke for every character. All behavioral assertions and the existing timeout remain intact.
- GitHub Quality Gate for target source `602d4ae0000dd9e7fd8ab89d12f00e1d04ed7ca1`: [run 102](https://github.com/Snow-force/snow-force/actions/runs/40138498256), completed successfully before merge.

## Production schema

Applied the reviewed `20261024035754_event_group_waiver_v2.sql` as Supabase migration **20261024222536 — event_group_waiver_v2**. The production migration version is the tool-assigned execution version; do not replay the local filename as a second migration.

Post-apply read-back:

- Enabled V2 events: **0**; V2 bookings/outbox entries: **0 / 0**.
- All nine new sensitive tables have RLS and no SELECT/INSERT/UPDATE/DELETE privileges for anon or authenticated roles.
- Eleven privileged RPCs: zero public/member execute grants, zero security-definer functions.
- Reminder view uses `security_invoker=true` and denies anonymous/member SELECT.
- Existing registrations / pending registrations: **261 / 139**, the same totals as immediately before expansion. No customer rows were created for acceptance testing.
- The three open events retain their original prices, approval requirements and five-friend caps: MetroSlopes full prepay 118 with approval; Mammoth Opening deposit 99 with approval; Thanksgiving deposit 99 without approval.

Security advisor comparison: the original leaked-password-protection warning remains unchanged ([remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)). RLS-with-no-policy informational notices increased from 30 to 39 because the nine new tables intentionally allow server-only access; grants were checked directly rather than adding permissive client policies ([linter explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). No new WARN/ERROR finding was introduced by this migration.

## Application and Railway

[PR #42](https://github.com/Snow-force/snow-force/pull/42) merged to main after all checks passed. Railway required a one-time approval because the GitHub contributor was not linked to a Railway account. The first browser attempt stopped because its URL could not be identified safely; after the user requested a retry from the authenticated in-app Railway page, the specific pending deployment was approved. No global approval requirement was disabled.

| Item | Verified value |
|---|---|
| Application revision | `76345c62d6ae64c61e2cb4f7f493e2d0117e270c` |
| Railway deployment | `98fc53a6-e5ac-460f-b5af-2611271afa27` |
| Deployment state | SUCCESS; build, TypeScript and `/api/health` checks passed |
| Active location / replica | `sfo`, one healthy running replica |
| Healthcheck completion | 2026-10-24T23:51:54.863Z |
| GitHub source | `Snow-force/snow-force`, `main`, no commit pin |
| V2 delivery configuration | Dedicated encryption/worker/webhook secrets not configured; no new scheduler or provider callback |
| Existing staged changes | Patch `b2de2a43-2321-441f-91c2-d7a0550ff591` still STAGED with its three original region/shop changes |

The actual deployment location is `sfo`. The service editor may show the staged US East configuration; it was not applied by approving this individual code deployment. Existing V1 registration processing remains available. Adult/guardian draft texts were not saved as approved event policies.

## Production smoke checks

At 2026-10-24T23:52:43.521Z:

- `/api/health`, `/events/waivers`, the invalid legacy guest invitation page, and all three current event pages returned HTTP 200. Event pages contained `hello@snow-force.com`.
- The new private waiver entry showed the complete-link prompt and `noindex, nofollow` / `no-referrer` metadata.
- Unauthenticated `POST /api/events/waivers/dispatch` returned 401 before queue processing.
- `POST /api/resend/waivers` without configured delivery credentials returned the expected 503 unavailable response; no provider webhook was configured or real email sent.
- The application Data API could read the new schema; all three open events had both V2 flags false. V2 policies/bookings/email jobs remained **0 / 0 / 0**. Existing payment models, approvals and five-friend caps were read back unchanged.
- These checks created no real booking, charge, refund or waiver-email job. They do not substitute for future approved V2 recipient/signing/guardian/entry acceptance.

Local evidence: `output/event-v2-code-deployment-smoke-20261024.json` and `output/event-v2-code-deployment-success-20261024.jpg` in the original workspace. The screenshot shows this release as ACTIVE / Deployment successful while the separate three-change patch remains unapplied.

Rollback, if needed: use the prior successful application build while retaining this backward-compatible schema expansion. Do not delete V2 tables or evidence, and do not apply unrelated pending changes. V2 activation still requires the open implementation, legal/privacy and operational prerequisites recorded in the [readiness document](event-group-registration-v2-readiness-20261023.md).
