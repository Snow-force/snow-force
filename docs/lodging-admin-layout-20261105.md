# Independent lodging administration layout

Lodging is optional per activity. An activity with no associated package defaults
to no lodging, needs no additional setup and retains normal registration/pricing.
The activity-filtered empty state says “此活动不提供住宿” rather than implying a
missing required configuration. It does not prompt hotel creation for that
activity; staff add a package only when accommodation is actually offered.
The local preview includes a synthetic day-trip example without accommodation,
verified in the browser and captured in
[`optional-no-lodging.png`](../output/lodging-admin-layout-20261105/optional-no-lodging.png).

The user requested a clearer, standalone lodging management surface rather than
lodging forms appended to activity editing. This change keeps the existing
catalog, authorization, conflict checks, audits and draft-only sales boundary.

## Evidence and findings

Captured the actual existing React components with synthetic data in a local
preview. This is a layout audit of those components, not an authenticated
production-session audit. No customer data or live writes were used.

1. **Catalog overview — confusing hierarchy.** Hotel, room and offer sections
   were stacked, with several expandable editors in one long page. Activity
   packages appeared below reference data, away from the operator's primary task.
2. **Package editing — unnecessary operational detail.** Staff had to enter an
   activity slug; hotel and room choice were combined, and the same configuration
   appeared in activity editing as well as lodging administration.
3. **New module — verified in local preview.** Separate Activity packages, Hotels
   and Room types lists now have clear add/edit actions. Only one editor opens at
   a time. Search, activity filtering, hotel filtering and cancellation work.
4. **New package editing — verified with synthetic saves.** Activities are chosen
   by name; choosing a hotel restricts room choices and clears stale selections.
   Dates, fixed per-person package price and bilingual policies have separate
   sections. Internal costs use dollars and percentage tax, under an optional
   disclosure. Price inputs still normalize to exact integer cents server-side.
5. **Preview and responsive checks — verified.** One person at USD 399 totals
   USD 399; three total USD 1,197. Editing an example to USD 429.50 and saving
   returns to the updated list. English/Chinese switching and the 390px mobile
   layout were checked. Mobile search uses its own full-width row; the wide data
   table scrolls horizontally without making the whole page overflow.

Before/after screenshots use the same components, fixture and desktop viewport;
the mobile capture is separate:

- [Before overview](../output/lodging-admin-layout-20261105/before-catalog.png)
- [Before package form](../output/lodging-admin-layout-20261105/before-form.png)
- [After overview](../output/lodging-admin-layout-20261105/after-catalog.png)
- [After package form](../output/lodging-admin-layout-20261105/after-form.png)
- [After mobile](../output/lodging-admin-layout-20261105/after-mobile.png)

The preview uses an explicitly labeled local save adapter with synthetic data.
It exercises form validation and state transitions; it does not establish a
production database write or full accessibility compliance. Controls retain
labels, semantic tables, live result messages, keyboard focus and 44px targets.

## Production implementation

`/admin/lodging` loads catalog data and activity labels after `requireAdmin()`.
Only slug, bilingual title and event date are sent as activity choices. A known
`?event=<slug>` preselects the activity; unknown values are discarded. Disabled
or failed loads do not show mutation controls. Events and catalog load in parallel.

Activity editing now links to that independent module. Its registration settings
and page no longer contain lodging editors or a second catalog fetch. The old
embedded components were removed. Hotels and room types remain reusable, and
package saves use the existing authenticated server action and version checks.

No schema, dependency, production data or sales-enable flag changed. Customer
lodging booking and payment remain closed. The local design preview is not a
new public route and cannot bypass production staff authentication.

## Validation

All 1,536 tests across 232 files passed, including the optional-lodging default
and explicit add/cancel flows. Production build passed ESLint,
compilation, TypeScript and page generation on Node 24.22.1. Coverage passed on
the same 1,536 tests, with overall lines 66.05%. Final test/build logs contain no
unexpected console output, act warnings or build warnings. An initial rerun hit
a Windows/OneDrive lock on a generated `.next/types/root-params.d.ts`; after
stopping the local Vite preview and reading the generated file, the unchanged
production build completed. No source deletion, ignored check or configuration
workaround was required. Earlier language regressions were updated for the new
module title while preserving bidirectional language-switch and staff-guard checks.

Focused coverage includes activity-label filtering, hotel/room dependency resets,
legacy unpriced packages, exact cost conversion, fixed per-person totals,
successful save/return, conflict retention and disabled/error states. Customer
payment integration is unchanged and still outside this UI batch.
