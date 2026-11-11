# Homepage data and motion budget

## Public reads

The homepage has independent Next Data Cache entries with a 300-second revalidation interval for event summaries, recap summaries, featured commerce products, and the footer's public support email. Keys include the configured public project/backend identity; they never contain member cookies or privileged keys. React's per-render cache alone is insufficient for this workload.

A cold successful render performs:

- One Supabase events request, at most 3 published/open-or-full rows, ordered open first and then by date. No registration records, counts, questions, modules, waivers or reviews.
- One Supabase event_recaps request, at most 3 published rows. No article bodies or album media arrays.
- One commerce region request and one product request limited to 3 items. No category/collection/promotion crawl.
- One public policy request for the footer contact. Only that contact is shared; checkout/member policy reads retain their existing behavior.

Warm renders reuse these public results. Revalidation is stale-while-revalidate, not a guarantee that every process/region executes exactly one request every five minutes. Errors throw inside cache readers and are handled by the page/footer after the cache boundary. Existing successful cached content can remain available during an upstream outage.

Staff event changes already revalidate `/`. Recap edits/media changes and the recap publish/draft route now also revalidate `/`. External changes made directly in Supabase/Medusa appear after timed revalidation; no webhook configuration is added here. Homepage prices and registration state are discovery snapshots. Exact availability, current price and registration eligibility are checked by the existing detail/registration/checkout flow.

## Media and scrolling

The existing mountain video is a local public asset, separate from Supabase database egress. It retains `preload="none"` and has no source until explicit playback. Leaving the viewport or hiding the tab pauses playback. Scrolling back never starts it automatically. Below-fold images load lazily and use the existing bounded public preview delivery policy where applicable. Recap albums are not prefetched by the homepage. Homepage cards, primary navigation and footer links disable automatic route prefetching, so entering the viewport does not cause extra server reads.

Decorative movement is implemented with CSS scroll/view timelines: mountain depth, outlined lettering drift and section entry. There are no per-frame React updates, network callbacks, polling, Realtime subscriptions or new animation dependencies. Unsupported browsers show static content. Mobile widths below 768px omit these scroll effects. Reduced-motion preference disables transitions, animations and smooth scrolling.

## Verification and limits

Focused tests use real Supabase query construction against stub HTTP responses to verify projection, publication filters, ordering, request count and server-side limits. A production-server integration check uses a local stub upstream and records source requests across nine homepage visits with alternating language cookies in `output/homepage-redesign/cache-verification.json`.

The billing screenshot shows total egress above the included allowance, but cannot attribute it to database rows, image/storage traffic, auth, bots or other consumers. No production billing credentials were supplied. These changes reduce homepage reads and payload size; the actual account-wide reduction must be measured after deployment in Supabase usage and origin/CDN logs. CDN cache hits can have separate billing, so do not treat cached egress as free.

Reproduce the cache check after `npm run build` with `node scripts/check-homepage-cache.cjs` (local ports 4599 and 3001 must be free). It uses only a local anonymous stub upstream, never the production database. With a local preview running on port 3000 and Playwright/Chromium installed, `node scripts/check-homepage-browser.cjs` checks native motion, reduced motion, five responsive viewports and the absence of fetch/XHR traffic during scrolling.

## Immersive mobile framing

The final phone layout keeps the full-bleed video. `src/lib/home/video-framing.ts` contains reviewed focal coordinates for the existing 15-second, 1280×720 clip. Native media `timeupdate`, `seeked` and `loadedmetadata` events write a single CSS custom property; no React render, animation timer, image analysis, backend call or additional media resource is used for framing. The desktop ignores this mobile-only property. If the video is replaced, review and update these coordinates and their tests. Mobile copy fades out only while the user explicitly plays the video, leaving the pause control visible; pausing restores the original actions.

With Playwright/Chromium and a local preview on port 3000, `node scripts/check-homepage-subject.cjs` verifies the reviewed subject locations at 11 timestamps, in two languages and three phone sizes (66 checks), plus playback overlay visibility and pause recovery. It saves real playback screenshots and `subject-framing-verification.json`.
