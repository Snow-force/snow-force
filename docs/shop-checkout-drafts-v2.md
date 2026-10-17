# Checkout drafts and final review

The website keeps its in-site Stripe form and manual-capture payment flow. A complete address first produces an estimate. Explicit policy agreement and “Review & continue to payment” commit the receiving details, verify the current merchandise/delivery/tax source, apply one exact calculation and enter the existing guarded payment preparation. No estimate reserves stock or authorizes payment.

## Contracts

- `POST /store/snowforce/checkout/:id/preview` accepts an authenticated receiving draft with the current receiving-details version. Product money, tax codes, origin and eligible options come from the server. The native availability workflow reads the draft destination through a request-scoped projection. The native cart is unchanged. The response includes current merchandise, estimate, eligible options, policy and an opaque encrypted token.
- `POST /store/snowforce/checkout/:id/draft-commit` accepts that token. A changed cart baseline, identity, receiving contact, selected option, policy, account/key namespace, configuration, classification or merchandise invalidates it. Original prices and discounts must match, even when a changed combination has the same net amount. The existing native workflows save details and check delivery. Matching private provider evidence is rebound to actual native row IDs, atomically applied, then reviewed.
- The website accepts policy consent for that exact estimate/version and invokes the existing payment endpoint only when the committed total and policy still match. Browser-supplied money is never accepted. A lost response requires current payment-state verification; it is not proof that a write failed.

The client serializes quote work, keeps fields editable, ignores superseded results and never replaces the latest raw draft with an older response. It refreshes estimates before their validity boundary. Errors distinguish a changed checkout revision from an unavailable estimate. An estimate's `ready:false` remains non-payable on the backend; only final native application can create a payable proof.

## Evidence and concurrency

`commerce.snowforce_checkout_quote_drafts` is private, RLS-enabled, owned by the commerce role and inaccessible to Data API roles. Pending input/idempotency evidence and complete results are retained. Abandoned or ambiguous estimates are separate from native pending tax operations and cannot lock native cart editing. Successful evidence is immutable. Exact valid requests are reused; new requests have a per-customer budget.

A provider calculation that has already entered the native quote ledger is excluded from later preview reuse: each native calculation identity remains unique. Returning to a previous address obtains fresh evidence instead of importing a historical calculation a second time. At explicit final review, an older pending native request first resumes its original provider identity through the existing recovery flow. An unapplied completed native result is reused through that same flow; its immutable request/result is never overwritten with another preview. Preview itself never performs native recovery or cart writes.

The encrypted token binds the authenticated cart/customer, full native baseline, receiving version, identity, selected option, private quote ID, policy content/version, Stripe setup/key namespace and expiry. It is sent in POST bodies, not URLs. It is not a payment capability by itself. The application does not cache private carts/addresses across requests or skip native inventory/amount/payment-state checks.

## Rollout and rollback

1. Run focused/full root and commerce tests, coverage, type checks and builds. Exercise the real isolated native APIs and Stripe Sandbox. Verify race/expiry failures, pickup and shipping, immutable evidence, zero unintended orders/funds, and first-address latency separately from quote reuse.
2. Apply `20261017232618_shop_checkout_quote_drafts.sql` before enabling either feature switch. No existing tables or financial records are rewritten. Verify ownership, RLS and role privileges. Its filename matches the production migration history assigned by Supabase.
3. Deploy the backend with `COMMERCE_CHECKOUT_DRAFTS=false`, then verify the new version. Enable `COMMERCE_CHECKOUT_DRAFTS=true` separately and verify endpoints in the isolated/formal acceptance flow.
4. Deploy the website, then enable server-only `SHOP_CHECKOUT_DRAFTS=true` after backend/schema readiness. Keep the existing optimized-read/shipping switches and region/resource settings unchanged.
5. Verify formal cold/warm first-address estimates, final review, expiry, repeated edits, cross-tab conflicts and mobile behavior. Proposed p95 targets are 2 seconds for an estimate and 3 seconds for final review, excluding customer/payment-provider challenges. They are acceptance goals, not measured production results or an SLA.

To roll back, disable `SHOP_CHECKOUT_DRAFTS` first, then `COMMERCE_CHECKOUT_DRAFTS`. Existing receiving-details, tax-quote, recovery and payment endpoints remain available. Preserve draft, quote, payment and order evidence; do not drop the new table or delete records as a rollback shortcut. No live charge, capture or refund is authorized by this implementation or its performance tests.
