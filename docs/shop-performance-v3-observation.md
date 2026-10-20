# v3 PR-A: correlated cart and payment observations

This is the observation batch from `SnowForce_商城加购与付款性能优化计划_v3`. It does not enable SDK prewarming, replace native cart workflows, merge edit/write requests, reuse payment evidence, change capture mode, or move infrastructure. PR #35 remains separate and is not part of this tree.

## Enablement and rollback

Default: off. Set `SHOP_PERFORMANCE_TIMING=true` and `SHOP_PERFORMANCE_SAMPLE_RATE=0.1` on the web service; set `COMMERCE_PERFORMANCE_TIMING=true` and `COMMERCE_PERFORMANCE_SAMPLE_RATE=0.1` on Commerce. Rates must be finite numbers between zero and one. The same UUID-based deterministic selection is used by browser, web and Commerce, so selected requests correlate rather than being sampled independently at each hop. The web layout supplies the current rate at runtime; no public build-time key or extra configuration fetch is required. Reload already-open shop tabs after changing the rate.

Roll back observation by setting both timing flags to `false` and reloading open tabs. Do not apply the existing staged Railway region patch to change these variables. Set only these named live variables, keeping the deployment source and staged infrastructure separate. No quote, draft, payment, order or operation record is deleted.

## Measurement definitions

- `browser/action.send`: click-handler measurement start to the browser's Resource Timing fetch start for the action URL. Emitted only if exactly one matching fetch exists after the start and before action completion. Missing/ambiguous entries remain unknown; it is not inferred from cross-machine clocks or by subtracting percentiles.
- `browser/action.return`: handler measurement start through the awaited Server Action response, including client queueing, network and RSC response decoding. It excludes the later cart UI paint. New/existing/coupon browser scenarios describe the currently shown snapshot; server `action` scenarios classify the actual owned cart and payment lock.
- `web/action`, `auth`, `read_validate`, `cart.create`: action execution and its internal stages. `commerce.*` phases include transport, response body parsing and schema checks; nested `commerce.fetch` stops when fetch returns headers. Nested/parallel durations must not be added together.
- `web/checkout.commit`, `checkout.review`, `checkout.prepare`: final draft application, current review and payment preparation. These continue to use all original ownership, version, quote, stock, policy and money checks.
- `commerce/commerce.line_items`, `commerce.edit`, `commerce.preview`, `commerce.commit`, `commerce.checkout`: HTTP middleware lifetime until `finish`; premature socket closure is `connection_closed`, never proof of a failed payment. The middleware observes, then calls the original chain exactly once. It grants no permissions.
- `browser/payment.mount`: original continue-payment handler start through committed dynamic payment component mount; includes backend preparation and module loading.
- `browser/payment.sdk`: remaining SDK promise wait beginning at the mounted attempt's effect. Existing SDK loading starts during the original memo initialization, so this is **not** the SDK's complete download duration. `payment.mount` and `payment.interactive` retain the full journey timing.
- `browser/payment.element_ready`: Stripe's first `onReady` event. `payment.interactive` is recorded only when `onReady`, `useStripe()` and `useElements()` are all available. A 30-second readiness timeout is reported separately. A late `onReady` cannot undo the existing timeout/retry behavior.
- `browser/payment.confirm`: actual confirmation duration and a bounded category such as `authorized` (`requires_capture`), `succeeded` or `processing`. No PaymentIntent ID or provider response is logged. `payment.order/returned` only means the existing order-check callback returned; it does not prove an order, capture or shipment.

Each selected operation carries a random UUID through the diagnostic-only Server Action argument and fixed Commerce headers. No authorization, idempotency or recovery decision uses it. Current web/backend revisions are recorded when Railway supplies a valid commit SHA. Existing OTel spans receive `snowforce.operation_id`/`snowforce.operation` attributes when an active span is available. Active/incoming trace IDs can connect to existing PostgreSQL/Redis spans; no tracing provider or DB driver is installed or monkeypatched. If no trace context is available, do not invent database or lock durations from the HTTP total.

## Privacy, load and provenance

Behind the production reverse proxy the request URL can contain an internal host. Keep `NEXT_PUBLIC_SITE_URL=https://snow-force.com` and explicitly set the collector's alternate origin `SITE_URL=https://www.snow-force.com` so both served domains can report. `SITE_URL` is used only by this collector in the web source. Forwarded/Host headers never extend this allow-list; `Sec-Fetch-Site: cross-site` is still rejected. Verify both domains with an invalid-schema POST (400) and a foreign-origin POST (403), without recording synthetic timing samples.

The browser collector accepts only a strict finite schema, same-origin JSON POSTs, at most 2,048 bytes, and at most 600 candidate requests per process per minute. Unknown fields (including addresses, tokens and client secrets) are rejected. Browser collection uses `credentials: omit`, so it neither transmits member cookies nor triggers Supabase session refresh in the current proxy. The collector makes no database calls and returns an empty response.

Diagnostic logs contain fixed operation/phase names, random IDs, bounded dimensions, duration, outcome and optional revision/trace ID. They do not contain cart/customer/product IDs, JWTs, addresses, amounts, URLs, request/response bodies or exception messages. Logging/collection/tracing outages cannot change transaction outcomes. Browser observations and correlation headers are untrusted telemetry, never payment evidence. The collector's rate bound is per process, not a distributed quota.

`initial`/`subsequent` means first/later **sampled invocation of that operation in this browser module lifetime**. It does not prove cold/warm cache state. Controlled baselines must additionally record first-load/repeat-load and broadband/throttled-mobile conditions in their experiment metadata. Report new cart, existing cart, promotion and payment-lock scenarios separately.

## Aggregation and acceptance

Export the selected structured log events as NDJSON and run:

```sh
node scripts/shop-performance-summary.mjs path/to/selected-events.ndjson
```

The script reports per-source/operation/phase/scenario/revision/viewport/network/visit p50, p95, p99, non-timeout error rate, timeout rate and business rejection rate. It deduplicates exact observations and never sums nested phases or outputs individual operation IDs. Operational minimum flags are 100 observations for p95 and 1,000 for p99; these are sample sufficiency warnings, not statistical proof or a performance pass. Browser and server observations must stay separate.

Compare prepare/mount counts with readiness terminal counts to disclose censored or abandoned attempts. Missing terminal events are not fast successes. SDK rejection, Element load error and readiness timeout produce explicit failed readiness observations. Percentiles describe recorded observations, not a claim that unobserved/abandoned sessions completed.

Targets remain: add action p95 ≤3s, initial checkout and preview p95 ≤2s, warm continue-payment to usable form p95 ≤3s. No target is claimed met by this batch. Production financial authorization, capture, refund and cancellation are excluded from measurement. Use the existing isolated PostgreSQL/Stripe Sandbox for all financial-path validation.

Next batches remain independent: PR-B SDK/module prewarming behind a switch; PR-C protected idempotent native add endpoint after baseline evidence; PR-D final commit/prepare read reduction after the Sandbox matrix. Production low-volume samples must not be promoted to a reliable p95 baseline.
