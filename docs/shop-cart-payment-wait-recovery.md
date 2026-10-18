# Cart and payment waiting recovery

This batch continues `SnowForce_商城优化实施计划_v1.md` after checkout draft previews (PR #33). It changes the existing storefront; no schema, infrastructure, capture-mode or payment-method configuration changes are required.

## Behavior

- Adding an item opens the cart immediately and announces the pending addition once. Existing contents and amounts remain server-confirmed; an empty cart does not show the empty-state message during addition. Conflicting cart controls stay disabled. Closing the drawer does not cause it to reopen after completion.
- Existing-cart and public variant reads start together inside the authenticated add action. Both must finish before creation or mutation. Ownership, current region, stock, native edit and payment checks still apply. Update and delete paths retain their current checks.
- A secure payment form that fails or takes 30 seconds to load offers an explicit reload. Reloading remounts the loader with the same payment intent; it does not prepare or confirm another payment. An obsolete ready callback cannot unlock a timed-out form.
- An exception or indeterminate response after payment confirmation starts blocks further authorization until the existing server status-check flow resolves the payment. A definitive card/validation error still permits corrected details. Successful, authorized and processing responses go through server order verification and cannot authorize again if that verification fails.
- Changing the site language preserves the current Elements instance and confirmation guard. The embedded provider form retains the locale selected when that instance was created; surrounding instructions translate immediately.

## Verification and release gates

Run `npm test`, `npm run test:coverage` and `npm run build` before release. Focused tests cover loader failure/timeout/retry, late callbacks, uncertain payment outcomes, duplicate confirmation, server verification failure, language changes, pending cart contents, closing the drawer, and parallel-read rejection without writes.

Browser checks use the existing synthetic member, isolated local Medusa/PostgreSQL and Stripe Sandbox configuration. Desktop addition receives a one-shot 35-second backend delay; mobile (390 × 844) receives 45 seconds. Both must show the original quantity until success, disable conflicting controls, and clear waiting feedback when settled. The mobile long-wait state must offer a read-only current-cart link after 30 seconds. Restore the original fixture quantity afterward.

Local screenshots and request traces are supporting evidence. They do not establish production p95 or validate every wallet, bank challenge or webhook ordering scenario. Keep those entries open in the overall plan until separately exercised. No real payment, capture or refund is part of this batch.

Rollback is the previous frontend revision. The server contracts and native payment history remain compatible; a frontend rollback must not change provider transaction facts.
