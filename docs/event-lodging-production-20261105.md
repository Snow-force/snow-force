# Lodging administration production release — 2026-11-05

The user authorized a direct production release after isolated preview acceptance.
This release enables hotel, room-type and event lodging draft administration, plus
private inventory primitives. Customer lodging booking, checkout and refunds are
not enabled. `event_lodging_offers.sales_enabled` remains constrained to false.

## Production target

The live domain `https://snow-force.com` is served by Railway `snowforce-web`, not
the old Vercel project. Railway project: `026e1ce6-a125-422c-b29f-a44ee11bdac1`;
service: `6fda6b39-d34b-4fb1-8457-e67f52a52ab3`; production environment:
`1245a65e-0f62-4182-8c85-1858aa98c634`.

Previous deployment: `9e923947-a6af-4135-8ad4-a97241e92cf0`, source
`afadaad344c5f54a579b0d3de942a6bd1d027540`. This source is an ancestor of the
released branch, preserving existing cancellation and registration changes.

Release source: `9fc1f698a790241520b2e53ed9b30842e41e4bef`, already committed and
pushed on `codex/event-lodging-inventory`. Railway is explicitly pinned to this
commit: later pushes do not automatically deploy until the source is reconnected.
Only the web service received `LODGING_ADMIN_ENABLED=true`. Existing secrets,
commerce services, domains, region and worker settings were preserved. No staged
environment changes existed when inspected before this release.

An initially started deployment to the obsolete Vercel production target
(`dpl_3onT6Rh9yT9iRrsJ63m1raFXNpqp`) was canceled before completion. Its production
lodging flag was restored to false. No DNS or alias changes were made.

## Database and verification

Applied the committed catalog and inventory migrations to production Supabase
`bhmwxkynhyhquspiyact`:

- `20261104201624_event_lodging_catalog.sql`
- `20261105035034_event_lodging_inventory.sql`

Before and after migration: 12 events, 299 registrations, four staff accounts.
New lodging properties and unit nights: zero; enabled lodging sales: zero.
Anonymous catalog SELECT, authenticated inventory INSERT and anonymous reserve
RPC access were denied. No production fixtures, payments or emails were created.
Security advisors retain the existing leaked-password-protection warning; seven
new private tables add informational RLS-without-policy entries, with no new warning.

Before deployment, `npm test -- --maxWorkers=4` passed all 1,498 tests across 230
files. `npm run build` passed lint, TypeScript and production compilation under
Node 24.22.1. The same source previously passed isolated authenticated catalog,
conflict, audit, role-revocation and bilingual acceptance; see
`event-lodging-isolated-db-20261105.md`.

## Recovery

Railway deployment `fcd68d8e-c6dd-4d50-9c14-3ff9a9fab0ee` reached SUCCESS,
running the pinned source in the existing `us-east4-eqdc4a` region. Its container
healthcheck passed. Domain smoke checks returned HTTP 200 for `/api/health`, `/`,
`/events`, `/member` and `/shop`, without setup-error text. `/admin/lodging`
returned 307 to `/staff-login`; `/lodging` remains 404. Runtime logs inspected
after startup showed no application errors. Evidence is recorded in
`output/lodging-production-smoke-20261105.json`.

Production verification was read-only and anonymous; authenticated writes were
accepted on the isolated preview, not repeated against live operational data.
Operators enter through `/admin/lodging` using their existing staff account, or
select “住宿管理 / Lodging” in the administration navigation.

The Railway dependency installation reported deprecation notices for existing
`whatwg-encoding@3.1.1`, `tsconfck@3.1.6` and `eslint@9.39.5`. Build lint, typing
and compilation passed. Dependency modernization remains follow-up work; no
warnings were suppressed or dependencies changed during this release.

Disable `LODGING_ADMIN_ENABLED` and redeploy to hide setup, or roll the web service
back to the previous successful deployment. Keep the additive lodging tables;
do not drop production data as part of a web rollback. Reconnect an explicitly
reviewed source commit for future releases rather than assuming branch pushes
will deploy while this commit pin is active.
