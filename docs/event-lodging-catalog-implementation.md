# Event lodging catalog implementation

This is the first staged delivery from the lodging update plan: reusable hotels, room types and event lodging drafts. It does not implement the full lodging MVP.

## Included

- Staff-only `/admin/lodging` with English and Chinese fields visible together.
- Create/edit hotels, hotel time zone, photo reference, bed layout and occupancy limits.
- Fixed-date event offers with USD-cent prices, mandatory fees, draft tax estimate and cancellation policy.
- Database foreign keys, date/amount/bilingual constraints, private audit history and optimistic edit conflict detection.
- Catalog tables inaccessible to anonymous and ordinary authenticated clients; server writes use the existing staff guard and privileged database client.
- `LODGING_ADMIN_ENABLED=false` by default. Database check constraints prohibit enabling sales, even with the catalog feature flag enabled.

## Activation

Apply the new `event_lodging_catalog` migration, verify database permissions, then enable `LODGING_ADMIN_ENABLED=true` to allow staff to prepare drafts. Missing database configuration/migration produces a visible setup error. Do not populate assumed hotel inventory from the screenshot.

This change has not applied production migrations, changed runtime flags or opened public sales. No hotel emails, charges or refunds are triggered.

## Next implementation batches

1. Hotel contracts and confirmed nightly supply, continuous-unit allocations, atomic inventory holds and reconciliation.
2. Independent lodging Checkout, verified fulfillment, member orders and durable notifications.
3. Cancellation approval, per-room/night refund allocations and hotel fulfillment exports.
4. Integration, mobile verification, sandbox payment scenarios and controlled rollout.

The single draft tax estimate is an internal setup aid. Detailed fee/tax bases, responsibility and immutable transaction snapshots must be implemented before checkout. This estimate is never a payable quote.

## Rollback

Disable the catalog flag to stop staff writes. Keep the additive tables and audit history. There are no reservations or payments in this increment.

## Validation completed

- `npm test`: 228 files, 1,468 tests passed (35 new tests).
- `npm run build`: lint, TypeScript and production build passed.
- `npm run test:coverage`: 1,468 tests passed; lodging domain line coverage 100%, branch coverage 81.39%.
- Embedded PostgreSQL checks cover access grants, audit rollback, invalid bilingual/time-zone data, protected relationships and the sales-disabled constraint.
- Live database migrations, production feature flags and authenticated browser operations were not exercised or changed in this increment.
