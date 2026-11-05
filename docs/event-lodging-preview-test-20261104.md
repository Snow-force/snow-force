# Lodging preview deployment test — 2026-11-04

## Result

The code preview is deployed and READY. Full hosted integration is blocked by an
existing preview database configuration problem: the configured Supabase hostname
`vzhmowbsfoutyizlyonv.supabase.co` returns DNS name-not-found. The activity page
correctly shows its setup error rather than presenting an empty list as valid data.
The currently connected Supabase account lists only the active production project;
no verified separate test database is available in that connection.

Preview: https://snow-force-qae5vk3va-harrymeits-projects.vercel.app

- Vercel project: `snow-force` / `prj_9HOG2P3lLvuKiv4h2NmAmjMh2Zxs`.
- Deployment: `dpl_tW2zXRN1z6wHvZFX1KpxRLFusqUm`, preview (`target: null` in API).
- Deployed source: `a790243d029639b24374d4ac01562786ed11bf7d`.
- Git branch: `codex/event-lodging-inventory`, committed and pushed to GitHub.
- Vercel built that exact Git commit; no dirty local artifacts were uploaded.
- Deployment protection remains enabled. Smoke requests used the authenticated
  Vercel fetch tool's temporary access mechanism.

## Verification

| Check | Observed result |
|---|---|
| Local full tests | 229 files / 1,495 tests passed |
| Local production build | Lint, Next compilation, TypeScript and page generation passed |
| Real isolated PostgreSQL | All five acceptance groups passed, including twelve concurrent contenders |
| Cloud build | Completed successfully; deployment READY |
| `/` | HTTP 200, SnowForce homepage rendered; embedded activity data shows setup error |
| `/events` | HTTP 200, Current Events rendered; database setup error means data integration is blocked |
| `/member` | HTTP 200, anonymous member welcome/login surface rendered |
| `/admin/lodging` | Request resolves to Staff Admin login; no Save draft form exposed anonymously |
| `/lodging` | HTTP 404, no public lodging route exposed |
| New booking/payment CTA | Not present on the inspected public pages |
| Runtime error/warning logs | None returned for the inspected preview/time window; caught database errors still exist as described above |
| Production deployment | Same deployment ID before and after: `dpl_7mysXvE1D3GBCFFuziZ7jeFzBa1R` |

The original catalog and inventory migrations were not applied to a hosted database.
The lodging admin flag is absent in preview configuration and therefore defaults
off. No authenticated catalog edits, customer booking, Stripe Checkout, payment,
refund or notification was attempted. Authenticated administration and member
journeys cannot be considered verified by an anonymous login-page check.

The database acceptance used an isolated localhost cluster and is recorded in
`output/lodging-inventory-acceptance.json`; this is not hosted database acceptance.
Coverage was already run on the same inventory implementation in the prior local
continuation: 1,495 tests passed, overall lines 65.59%. SQL is verified with the
database suites, rather than measured by V8 coverage.

## Follow-up findings

1. Select a verified isolated Supabase test project (or authorize provisioning one),
   configure preview-only public/server keys and URL, and apply the relevant schema
   there. Do not point preview at production merely to make a smoke test pass.
   Then rebuild and verify activity reads, staff authentication and disabled
   lodging setup before testing draft data mutations. No secret values belong in
   this report or chat.
2. The cloud build reports an unknown npm `cache-dir` environment setting. No
   repository `.npmrc` or deployment config defines it; the warning originates in
   the build environment and does not appear in the local build. Review the
   provider's injected npm configuration before the next release.
3. The cloud installer reports an unreviewed `unrs-resolver@1.12.2` postinstall
   script. Its local entry delegates to `napi-postinstall` for native package
   preparation. Review and record the dependency script policy for the build
   environment. No blanket script approval, warning suppression or check reduction
   was applied. See the official [npm install-script policy](https://docs.npmjs.com/cli/using-npm/config/).

This test establishes deployment/build viability and anonymous access boundaries.
It does not establish a working hosted event database or completed lodging sales.
