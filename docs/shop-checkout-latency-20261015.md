# Checkout latency follow-up - 2026-10-15

## Production observations before this change

Railway project `026e1ce6-a125-422c-b29f-a44ee11bdac1`, production environment `1245a65e-0f62-4182-8c85-1858aa98c634` was inspected through the authenticated Railway connector.

- Commerce is one replica in `us-east4-eqdc4a`; web and the persistent Redis service remain in `sfo`.
- The 21:48 UTC checkout operation previously took 30.75 seconds at the web layer. Commerce runtime/proxy logs show address save 3.59 seconds, shipping-method application 4.64 seconds, tax quote 12.76 seconds and final review about 1.17 seconds followed by delivery alternatives about 2.11 seconds.
- The latest one-hour commerce resource sample showed average CPU usage 0.0077 vCPU, maximum 0.0729 vCPU (limit 1), and maximum memory about 0.4565 GB (limit 2 GB). This sample does not establish that increasing compute would solve checkout latency.
- Cross-region Redis is a remaining latency risk because the application uses it for locks, workflow execution and event queues, not just disposable cache. No Redis data, volume, queues, credentials or placement were changed by this patch. Database and payment settings are unchanged.

## Reversible storefront optimization

Set `SHOP_CHECKOUT_OPTIMIZED_READS=true` on the web service only after the quality gate passes and the new build is deployed. Unset it or set it to `false` to restore the conservative request sequence without changing any payment or tax settings.

1. Address and shipping writes return their existing native response instead of discarding it. Its cart ID and customer ownership are checked before use.
2. After saving an address, fetch fresh eligible shipping alternatives. When the single retained method has the same ID and price as the selected eligible method, skip the redundant second edit and shipping-workflow mutation. Missing, different, repriced or ambiguous methods still use the native workflow. Multiple eligible alternatives are not auto-selected.
3. Always run the existing native tax quote operation, including its ownership, payment-state, shipping, amount, policy and locking checks. Nothing treats retained shipping as a valid tax quote or payment authorization.
4. After delivery preparation, overlap the fresh status and delivery-alternatives reads. Optional alternatives failures are observed immediately and are only surfaced when the resulting review actually requires them. They cannot hide an already completed order.
5. Add a bilingual, accessible route-loading placeholder. It does not display provisional money, fake progress percentages or a success state.

The payment preparation, capture mode, inventory checks, consent and recovery flow are unchanged. No identity, cart, quote, payment state or promises are cached across requests.

## Validation boundary

Focused regression tests cover retained/missing/changed/ambiguous shipping, foreign response ownership, quote rejection, multiple alternatives, concurrent reads, optional-read failure, flag rollback and loading feedback. The existing test suite remains in place.

This document records the pre-change observations and implementation, not a completed production benchmark. Record the actual quality-gate and deployment results before claiming release. An authenticated end-to-end checkout measurement is still required before claiming a specific speedup; the 12.76-second tax operation is not eliminated by this change.
