# Independent lodging test database — 2026-11-05

## Provisioned resource

Created `snowforce-lodging-preview` in the user-selected Snow-Force organization,
region `us-east-2`. Project ref: `mcshlplkqbftsiwqgvva`.

[Test project dashboard](https://supabase.com/dashboard/project/mcshlplkqbftsiwqgvva)

The dashboard identifies the organization as Free Plan and this project as Nano.
No production data was copied and no production database writes were performed.
The project's `main / PRODUCTION` badge refers to this new test project's own main
database; it is separate from the existing live SnowForce project.

## Schema and database verification

- Applied 47 repository migrations, covering the application baseline, activity,
  member, staff, registration, waiver, cancellation, lodging catalog and inventory.
- Deferred 15 private commerce/marketing migrations. The first deferred migration
  requires native Medusa `commerce.order` and `commerce.customer`, which are created
  by the separately installed commerce backend rather than the Supabase migrations.
  Its failed transaction was rolled back. No placeholder commerce tables were
  created and these migrations were not marked applied.
- This is an activity/lodging test environment, not a complete commerce test stack.
- Found 53 public tables, all with RLS enabled.
- Confirmed anonymous users cannot read lodging units or execute inventory reserve.
- Confirmed no lodging offer has sales enabled.
- Ran the real hosted reserve/release path under `service_role`: continuous nights,
  manual occupation, no overselling, request idempotency, retaining unknown-payment
  holds and safe release all passed. The transaction was rolled back afterward.
- After browser acceptance and cleanup, confirmed zero leftover hotel, room-type,
  offer, event and test Auth-user fixtures; temporary staff access was revoked.
  Five synthetic audit records were retained as acceptance evidence.

The migration manifest is in `output/lodging-isolated-db-setup-20261105.json`.

Advisors returned no security WARN/ERROR findings; 25 service-only tables have
informational [RLS without policies notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
Those tables intentionally deny ordinary roles and use server-only access.
Inherited performance follow-ups include 19 unindexed foreign keys, one
[per-row Auth RLS evaluation warning](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan),
and 25 [overlapping permissive policy notices](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies).
Unused-index notices are expected for a new empty database. No broad grant or RLS
relaxation was made to remove notices.

## Vercel preview configuration and deployment

Updated only Preview variables:

- `NEXT_PUBLIC_SUPABASE_URL` → the new test project's URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` → its active modern publishable key.
- `SUPABASE_SECRET_KEY` → the dedicated test-project server key, saved as Vercel
  Secret (`sensitive`), only for Preview.
- `LODGING_ADMIN_ENABLED=true` for authenticated draft tests. This does not enable
  sales; the database continues prohibiting `sales_enabled=true`.

Vercel rejected branch-specific variables because this project has no connected
Git repository. The existing shared Preview configuration was updated instead;
Production and Development variables were not changed. Git-source deployments
are still possible through the authenticated deployment API.

Final deployment: `dpl_GhpyUmywHVXDAPdx63DnPM3W7gHS`, READY, source
`0cf55f85dd985950d27bac95d00f29815ab5ff15`.

[Preview](https://snow-force-mzmkh2hub-harrymeits-projects.vercel.app)

## Completed browser and hosted acceptance

The user completed Vercel sign-in. The new server key resolved the nonempty event
read failure: the repository loads questions, modules, booth configuration and
registration counts with its server client, even on public event pages.

| Check | Result |
|---|---|
| Synthetic event list/detail | HTTP 200; the explicit TEST ONLY event rendered without setup errors |
| Anonymous lodging administration | Redirected to Staff Admin login, with no editor exposed |
| Authenticated ordinary test user | Staff sign-in rejected as unauthorized |
| Temporary manager in isolated test project | Staff sign-in and lodging catalog succeeded |
| Hotel creation and update | Bilingual name persisted; address update incremented version |
| Room type | Linked to the saved hotel with bilingual beds and capacity four |
| Event lodging draft | Two nights at USD 100, USD 20 fee, 10% draft tax displayed USD 242.00 |
| Concurrent staff edits | Second editor's update persisted; stale first-editor save displayed a conflict and did not overwrite it |
| Audit | Five records matched the temporary staff actor; conflict produced no extra write |
| Language | CN/EN switching updated catalog, shell and navigation; Chinese survived reload |
| Revoked staff role | Existing signed-in session could no longer enter lodging administration |
| Final anonymous smoke | Home, events and member welcome HTTP 200; admin login guarded; public `/lodging` HTTP 404 |

No registrations, payments, refunds or messages were generated. The synthetic
account was created with auto-confirm enabled, so no confirmation email was sent.
All event, hotel, room, offer and account fixtures were removed after acceptance;
the five audit records remain. Production is still the original deployment
`dpl_7mysXvE1D3GBCFFuziZ7jeFzBa1R` and its database/configuration was not changed.

## Repair discovered through testing

`src/app/admin/layout.tsx` created a nested `LanguageProvider initialLang="en"`,
which isolated all admin content from the root language switch. Removed that
nested provider while keeping the staff guard and shell intact. Three focused
regressions cover initial Chinese, live switching in both directions and rejected
staff authentication. Before the fix the two language tests failed; afterward all
three passed. The fix is committed and pushed in `0cf55f8` and verified on the final
preview, alongside the existing lodging implementation.

`npm test` passed 1,498 tests across 230 files. `npm run build` passed lint,
compilation, TypeScript and production page generation. Coverage also passed;
overall lines are 65.65%. Existing payment branch coverage remains 63.14% and is
still a follow-up before adding lodging payment behavior. No dependency versions
changed. The local final logs contain no test stderr or build warnings.

The cloud build succeeded with the previously investigated npm `cache-dir` and
unreviewed `unrs-resolver` install-script policy warnings. Those build-environment
follow-ups remain recorded in `event-lodging-preview-test-20261104.md`; no warnings
were suppressed and no blanket script approvals were added.

This completes the current catalog/inventory deployment tests. Customer lodging
booking, payment, refund, full commerce and member email/callback flows remain
outside this batch. Configure the isolated project's Auth callback URLs before
running registration or magic-link acceptance. No test staff login remains after
cleanup; future operator testing needs an explicitly provisioned test identity.
