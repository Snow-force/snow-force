# Shop waiting feedback and checkout-locked cart recovery

## Observed deletion failure

Read-only production checks correlated the reported cart removal with a 409 from the `/store/snowforce/checkout/:id/edit` preflight at 2026-10-15T22:30:30.861Z. The actual line-item mutation was not reached. The backend reported `Check the current quote and payment before changing this cart.`

The cart's native collection was `not_paid`, its session `pending`, with no native order or authorization. The bound live Stripe PaymentIntent for USD 53.24 was `requires_action`, with zero received and capturable amounts at inspection. A browser back-navigation had not canceled that external intent. These observations are a snapshot, not permission to cancel a payment or a promise about its later state. No live payment or cart was changed for this investigation.

## Changes

- Classify only the exact owned edit preflight conflict as `checkout-locked`; retain ordinary inventory/validation errors separately.
- After that conflict, invoke the existing authenticated backend `recover` operation once. That boundary only reads Stripe and detaches provider-confirmed canceled sessions under native locks. It does not cancel, capture, refund or confirm payments.
- Require a second successful edit preflight after recovery and before the item mutation. No loop, lock bypass, provider-data deletion or optimistic removal.
- Active, authorized, processing, paid, unresolved-tax and concurrently changed checkouts remain blocked. Authorization, service outage and sales-disabled errors remain distinct.
- Show bilingual checkout-lock guidance instead of falsely blaming stock. The current active payment still needs explicit cancellation before this particular cart can be edited. This patch does not add a customer-facing cancellation endpoint.
- Add CSS-only spinner feedback for initial cart/checkout reads, adding and removing items, quantity and promotion updates, refresh, address/shipping/tax work, payment form loading, payment confirmation and order checks. Route loading retains its skeleton. Existing amounts are never changed by animation.
- Prevent duplicate item mutations and disable proceeding to checkout while a cart mutation is unresolved. Keep an item visible until server-confirmed deletion. Stop the animation on success or failure; replace Stripe SDK/element failures with an error rather than endless loading.
- Respect reduced-motion settings and use decorative hidden icons with descriptive status text.

## Release and validation

Changes are proposed in PR #20 on `fix/checkout-latency-20261015`. All tests, coverage and production build must pass for the new head before release; earlier green runs do not validate these later changes.

The prior Railway region/optimization patch remains separate and unapplied. Do not merge, deploy, cancel a live payment or apply staged infrastructure changes without the requested operator confirmation. After approval, re-read the full staged patch and bound PaymentIntent state before taking any action. A real cart-removal check remains necessary after release and after any explicitly approved cancellation.
