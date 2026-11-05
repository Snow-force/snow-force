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
- Confirmed zero leftover hotel/unit/hold fixture rows and zero Auth users.

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
- `LODGING_ADMIN_ENABLED=false`.

Vercel rejected branch-specific variables because this project has no connected
Git repository. The existing shared Preview configuration was updated instead;
Production and Development variables were not changed. Git-source deployments
are still possible through the authenticated deployment API.

Deployment: `dpl_DqoKwQTtDvefApysDg7ryRBuUFqe`, READY, source
`8f3945ea07ecf820d07d178d03cac728fb237d9f`.

[Preview](https://snow-force-485boheu9-harrymeits-projects.vercel.app)

## Test outcomes and remaining authentication step

- Homepage and empty activity list render HTTP 200 without the old database setup
  error; anonymous `/admin/lodging` resolves to the staff login form.
- A closed, free, explicitly named synthetic event was briefly inserted to verify
  nonempty activity reads. Both list and detail then showed the database setup
  error. The event repository uses the server client for questions, modules, booth
  configuration and registration counts, so a valid server key is required even
  for these public views when an event exists.
- The synthetic event was deleted and its absence verified. No registrations,
  payments or messages were generated.
- `SUPABASE_SECRET_KEY` still needs replacement with a key from the test project.
  The Supabase connector does not expose secret keys, and the local Supabase CLI
  is not logged in. Browser configuration reached Vercel's passkey challenge.
  The user has been asked to complete the existing Vercel sign-in; no passkey or
  recovery code should be sent through chat.
- A `vercel_lodging_preview` secret-key record was created in the test project.
  No secret value was recorded in this document or committed files.

After sign-in, configure the test server key only for Vercel Preview, rebuild,
repeat the nonempty activity checks, then verify staff authentication and draft
catalog operations with isolated test identities. Configure test Auth callback
URLs before running registration/password/magic-link flows. Keep lodging sales
disabled; payment, refunds and full commerce acceptance remain outside this batch.

Local verification was repeated: `npm test` passed 1,495 tests across 229 files;
`npm run build` passed lint, compilation, TypeScript and production page generation.
The local logs contain no test stderr or build warnings. No application source or
dependency versions changed during this provisioning step.
