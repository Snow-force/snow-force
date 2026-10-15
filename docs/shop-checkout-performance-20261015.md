# Checkout performance and flow correction — 2026-10-15

The operator reported waits over 30 seconds for cart changes, entering checkout, saving an address and selecting delivery. The selected visual references are the operator's Backcountry cart and checkout screenshots, with SnowForce branding and the existing supported payment integration retained.

## Verified causes

- The production delivery option still used `is_enabled_in_store=true`. Medusa 2.21 supplies `enabled_in_store` in its shipping-option context. The incorrect rule filtered out delivery despite the cart's valid US/USD region, default sales channel, default shipping profile and available Irvine stock. Only that rule's attribute was corrected; its value, return rule, prices and stock were preserved. A subsequent read confirmed `enabled_in_store=true` and `is_return=false`.
- Adding one variant loaded the entire priced/inventory-bearing catalog, categories, collections and promotions. The write now fetches only the selected variant and its current USD price and stock. The server-rendered shop header uses lightweight navigation/brand reads without price or inventory joins.
- Next dispatches client Server Actions sequentially. A checkout-entry cart load unnecessarily preceded the checkout action. The checkout review now supplies the already-authorized cart snapshot to the shared provider.
- Address/pickup preparation fetched full tax readiness and old-address delivery options before writing, then fetched them again. The automatic preparation commands rely on the existing owned backend edit/quote fences and return a fresh review. Region lookup is reused within that one action; no identity, cart, tax or payment result is cached across requests.
- Existing customer sessions repeated the locked linking write and a second authentication. A fresh backend authentication plus the native authenticated customer-profile read now suffices for an already-linked customer. Missing, deleted, mismatched or unauthorized profiles fail closed. First-time registration retains the locked bridge and refreshed token.
- A 15-second transport timeout could abandon a native mutation while it was still running. Fixed cart/checkout mutation endpoints have a bounded 60-second response budget; reads, authentication and unrelated paths retain 15 seconds. This is paired with query reductions and pending/duplicate-submit protection, not presented as the performance fix by itself.
- Production Railway config places the backend in `sfo`, while the confirmed Supabase project is `us-east-2`. Cross-region database latency is a likely additional contributor; a backend-only move to US East is staged, not applied. Railway's network-flow sample reports zero latency and does not establish a measured RTT. Compare real production endpoint timings after any approved move before claiming a regional improvement.

## Checkout behavior

- Desktop cart: product list and separate order summary. Checkout: focused address, delivery and payment cards, with a persistent summary; mobile puts the summary above the form.
- Complete, valid address input is debounced for 900 ms, then saved, assigned the sole eligible delivery service and quoted automatically. Multiple eligible services remain an explicit customer choice. Selecting a service requotes automatically.
- Pickup requires the customer's appointment confirmation and contact details; the backend selects the reviewed pickup location and verifies its signed receipt. Pickup tax is then recalculated automatically.
- Failed automatic calculation does not loop. Explicit refresh/retry can restart it. An edited, expired, failed or changing quote cannot enable payment.
- Full policy text remains collapsed and is scrollable within 320 px when opened. Per-order explicit consent and its signed version/fingerprint remain required before preparing payment. No consent, PaymentIntent or order is created by automatic address/tax updates.
- Editing an address or switching receiving mode hides the previous delivery/tax total until the new details are ready. Incomplete input does not show an unavailable-delivery alert. Cart merchandise subtotals use native item prices and quantities in integer cents; Medusa's cart-wide subtotal includes shipping and must not be labelled as merchandise.
- The checkout hides redundant shop navigation and the long site footer, retaining compact help, policy and privacy links. Historical payment recovery and immutable quote/consent checks remain intact.

## Evidence and limits

Isolated local Postgres and the provided Stripe Sandbox were used. A synthetic USD39 hat has native stock/location/profile links and the appropriate reviewed tax classification. At Irvine, delivery produced merchandise 3,900 cents + shipping 995 + sales tax 302 = total 5,197 cents. Pickup produced shipping zero and total 4,202 cents. No payment or order was created for this new fixture.

Browser measurements from the first tested iteration: add to cart 1,631 ms; enter checkout 1,833 ms; address/name recalculation 5,622 ms; appointment-pickup recalculation 4,934 ms. These are local fixture measurements, not production promises. Native API probe and final browser/visual evidence are retained under `output/incidents/2026-10-15-checkout-*` in the operator workspace.

The final authentication path was exercised through the browser: complete Irvine address input automatically produced a fresh delivery quote in 4,740 ms. Desktop English (1,280 px) and mobile Chinese (390 px viewport) checks found one main landmark, no horizontal overflow and no console warnings/errors. Expanded policy content measured 320 px visible height for 989 px of content. The synthetic fixture policy, customer contact and merchandise image are not production business content.

The owner explicitly approved the backend region move. The Railway connector nevertheless returned `Cancelled — the user did not approve this action. No changes were made.` The native Railway page is authenticated. Its final six staged fields retain the same repository/branch, pin backend source to `bfa2c7b`, remove the empty image field and replace West placement with one East replica; the owner has been asked to click Deploy Changes. Approval in chat alone has not changed the live region or backend code.

Final source validation: 1,050 frontend tests across 169 files, frontend coverage and production build passed; 651 backend tests, focused checkout/tax/pickup/shipping coverage, backend typecheck and production build passed. The final browser return-to-cart check confirms the merchandise subtotal is USD39 rather than USD48.95 with shipping included. Existing local `.data` tracing noise is documented in `design-qa.md`; runtime fixtures are excluded from the deployed Docker context.

## Production release result at 2026-10-15 20:56 UTC

Source `bfa2c7b07c368724c1913f96bfc0f23fa4d93cb1` is on GitHub main and matches the local commit/tree. Quality Gate run `38805071018` passed. Website deployment `e51f77e7-2d98-44d2-b1c9-a4b62050c2c8` is SUCCESS and serves that source; the actual authenticated production browser displays the redesigned checkout, original USD499 ski/155 cm, policy version 5 and the correct real product image. No console warning/error was captured.

A browser reload until the existing recipient field became visible took 7,377 ms before this frontend release and 6,093 ms after it, both against the unchanged West backend. This is one observation per version, not a latency distribution or the reported address-save benchmark. Production backend logs show one Supabase authentication (613 ms), one native customer-profile read (294 ms), one checkout review (2,248 ms) and one US region read (276 ms), all 200; the redundant linking write, second authentication and queued cart mount read are absent.

The new temporary auth/profile/consent fixture was removed with exact identity guards and global session revocation; it created no order projection or payment. Local test servers and isolated Postgres are stopped. The production cart was read only. The owner has been asked to fill their own real delivery address for final automatic-tax verification, without agreeing to terms or paying.

Backend query optimizations and US East placement remain staged pending the operator's native Deploy Changes click. The frontend is live; production automatic tax, add-to-cart timing and the regional performance comparison remain incomplete. No real customer charge was made.
