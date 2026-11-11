# Immersive mobile subject framing — latest QA

final result: passed

The user's final preference is the original immersive full-bleed treatment, with better subject framing. The separated 16:9 mobile panel below is a superseded trial. Some horizontal crop is intentional; the target is to retain the snowpeak/rider rather than show the full landscape at once.

- Source visual truth: `public/videos/snowmountain.mp4` (1280 × 720, 15.0167 seconds), original poster and the reviewed one-second contact sheet in `output/homepage-redesign/framing-study/one-second-keyframes.jpg`.
- Candidate browser proof: 66 reviewed subject checks across 320/390/430px phone widths and both languages passed. The video's actual media clock drives the focal point, including seeks, scene cuts and looping.
- Mobile uses an immersive viewport-height background, a smaller one-line wordmark, and compact overlaid copy/actions. During explicit playback, copy fades out to clear the rider; pause restores the actions. The pause control remains visible. Desktop styles are unchanged.
- Candidate captures: `mobile-immersive-zh-poster.png`, `mobile-immersive-en-poster.png`, `mobile-immersive-frame-0.5.png`, `mobile-immersive-frame-3.5.png`, `mobile-immersive-frame-8.5.png`, `mobile-immersive-frame-14.5.png`.
- Final production proof: `subject-framing-verification.json` reports 66 passing checks, no page errors, actual media-clock positioning and restored controls after pause. Final screenshots above are from the standalone production build, not the development preview.
- Six general viewport checks passed. Phone video frames are full-bleed `cover`: 320 × 504, 390 × 780 and 430 × 868 CSS px. CTA/wordmark spacing is valid; no horizontal overflow.
- Native desktop scroll motion remains active; reduced motion disables decorative transitions; scrolling produced zero fetch/XHR requests. Explicit play downloads the same video once and offscreen playback pauses.
- Final full suite: 254 files / 1716 tests passed, exit 0. Production build passed, exit 0. Focused framing/media coverage: 100% lines; focal-point helper: 100% statements/functions and 92.85% branches.
- Visual review: original dark/light palette and full-bleed atmosphere retained. Mobile typography is compact and the one-line outlined mark leaves more image visible. During playback, copy visibility is hidden rather than merely transparent, keeping hidden actions out of keyboard navigation; pause restores them. Portrait crop is intentional and the reviewed subject stays prioritised.
- No actionable P0/P1/P2 findings remain for the final preference.

---

# Superseded mobile full-frame trial (history)

# Mobile Hero framing correction — latest QA

final result: passed

User feedback identified that the prior mobile layout adapted text and controls but retained a landscape video stretched with `object-fit: cover` across a portrait container. At 390 × 844 CSS px, the video box was 390 × 780px, showing about 28% of the source width. The earlier overflow checks did not establish correct image framing.

The correction gives phones a separate composition: copy/actions above a full-width 16:9 video frame with `object-fit: contain`, followed by a compact outlined wordmark and playback controls. Desktop composition and existing media remain unchanged. No new requests, media assets or database reads are introduced.

- Reproduction: `scripts/check-homepage-browser.cjs` failed with `Mobile hero crops the landscape video at 390px: 390x780, cover`.
- Candidate screenshots: `output/homepage-redesign/mobile-panorama-zh.png` and `mobile-panorama-en.png`.
- Candidate browser checks: 320, 390 and 430px widths, both languages; complete 16:9 framing and no horizontal overflow.
- Final production checks: 320 × 568, 390 × 844 and 430 × 932 video frames are respectively 320 × 180, 390 × 219.375 and 430 × 241.875 CSS px, all `contain`, with no overflow. Desktop/tablet checks still pass.
- Production screenshots: `output/homepage-redesign/mobile-hero-zh.png`, `after-mobile-zh.png`, `after-mobile-en.png`; matched 390 × 844 comparison: `mobile-framing-comparison.png`. Original framing truth is `public/videos/snowmountain-poster.jpg` (1280 × 720); the entire landscape now fits in the matching 16:9 frame.
- Browser verification: explicit playback works, source remains absent before play, offscreen pause works, language switching works, no page errors or scroll-triggered fetch/XHR requests.
- Final `npm test -- --maxWorkers=2`: 253 files / 1709 tests passed. Final `npm run build` passed.
- No actionable P0/P1/P2 issues remain for this correction.

---

# Cinematic homepage — latest QA (2026-11-11)

final result: passed

## Visual truth and evidence

- Selected visual: `output/homepage-redesign/selected-reference.png`, the second displayed image of the latest ideation set. Original source: `/workspace/generated_images/exec-bc75c1d6-26a8-432b-9198-6db3b49772c5.png`.
- Rendered production implementation: `output/homepage-redesign/after-desktop-zh.png`; English and mobile captures are in the same folder.
- Source raster: 921 × 1708 px, interpreted as the generated representation of the requested 1440px desktop design. Implementation: 1440 × 3591 px, browser viewport 1440 × 1000 CSS px, deviceScaleFactor 1.
- Combined full-view comparison: `output/homepage-redesign/visual-comparison.png`, both surfaces normalized to 720px width and placed side by side without changing aspect ratios. Focused first-1000px comparison: `output/homepage-redesign/hero-comparison.png`, source first normalized to 1440px width.
- State: anonymous Chinese homepage, hero paused on the original poster, reduced motion for stable visual captures. No production credentials are present, so the implementation truthfully shows a schedule error rather than the mock's planned-event empty state.

## Comparison history and findings

1. [P2, fixed] The first implementation's outlined lettering was undersized and the existing navigation used a narrower grid. Enlarged lettering with a viewport-height bound to prevent overlap, increased stroke weight, and aligned homepage navigation with the content grid. The latest combined and focused comparisons show the corrected hierarchy.
2. [P2, fixed] The English departure heading repeated itself. Removed the redundant English subtitle while retaining the bilingual hierarchy in Chinese. Rechecked English desktop/mobile captures.
3. [P1 performance, fixed] A production browser scroll initially triggered 23 route fetches from the legacy footer. Disabled automatic prefetch on homepage content, navigation and footer links. Latest `motion-verification.json` records zero fetch/XHR requests while scrolling through the entire homepage. Lazy image loads remain intentional.

## Required fidelity surfaces

- Typography: clean system sans headings, clear Chinese/English wrapping and outlined italic brand lettering match the selected visual language; body text remains at usable product sizes. No external font download or font-loading shift.
- Layout/rhythm: full-bleed hero, dark image-and-briefing departure section, light ruled community section with sticky photograph and numbered preparation sequence. Five responsive viewports pass with no overflow or CTA/lettering overlap.
- Colors: near-black theatre, off-white editorial surface, white hero type and blue action color preserve the selected dark/light balance. No gradient text or decorative dashboard surfaces.
- Imagery: exact existing mountain video/poster retained. Existing brand logo, real SnowForce group photograph and the repository's mountain editorial photo deliberately replace fictional concept imagery. Published recap covers remain lazy, bounded and linked to real stories.
- Copy/content: all primary actions work in English and Chinese. Three practical preparation steps, published recap previews, actual commerce products when available, and existing footer are retained beyond the mock's two story steps. No fabricated availability, member counts, testimonials or trips.

## Browser and interaction verification

- Chromium production build: desktop English/Chinese at 1440 × 1000, mobile English/Chinese at 390 × 844. Additional responsive checks: 1440 × 800, 1024 × 768, 768 × 1024 and 320 × 568.
- Video is source-less before play, downloads once on explicit action, plays successfully and pauses offscreen. Switching language through the mobile navigation works.
- Native scroll animation changes the mountain transform from identity to `matrix(1.048, 0, 0, 1.048, 0, 29.952)` after scrolling 400px. Reduced motion yields animationName `none`.
- No browser page errors. No fetch/XHR requests during the final normal-scroll check.
- Keyboard departure switching, published-only/bounded recap covers, media failure/retry and loading-error recovery are covered by focused tests.
- Cross-request production cache check: nine visits with alternating language cookies produced one request per public source; see `cache-verification.json`.

## Accepted differences and limits

- Genuine project photographs and branding are used instead of generated fictional community photos. The complete site includes recap/commerce/footer content beyond the concept crop.
- Production database contents and account-wide billing reduction cannot be verified without deployment and production usage measurements. The provided billing screenshot does not identify traffic causes.
- Decorative scroll timelines degrade to static content on unsupported browsers and are omitted on mobile. These are intentional usability choices.

No actionable P0/P1/P2 findings remain.

---

# Prior QA history (preserved)

# SnowForce public UI redesign — design QA

## Visual target

- Selected template: `artifact-template-snowforce-full-bleed-mountain-memory`
- Reference image: `C:\Users\taiyu\.codex\skills\artifact-template-snowforce-full-bleed-mountain-memory\assets\reference.png`
- Reference source dimensions: 1487 × 1058
- Browser target viewport: 1440 × 1024 CSS pixels
- Implementation capture: `C:\Users\taiyu\.codex\visualizations\2026\08\15\01a003e7-e866-7930-a854-a2e8a5cadd80\snowforce-desktop-first-frame.png`
- Same-state comparison: `C:\Users\taiyu\.codex\visualizations\2026\08\15\01a003e7-e866-7930-a854-a2e8a5cadd80\snowforce-reference-vs-implementation.png`
- Mobile capture: `C:\Users\taiyu\.codex\visualizations\2026\08\15\01a003e7-e866-7930-a854-a2e8a5cadd80\snowforce-mobile-recap.png`

The comparison normalizes the reference crop to the browser capture dimensions and places the reference and implementation side by side. The source is used for composition, hierarchy, and motion-stage fidelity, not for copying its brand, copy, or photography.

## Findings and corrections

1. P1 — The desktop information panel did not initially match the selected dark split-stage treatment. Several Tailwind opacity modifiers used values outside the configured scale, so their CSS was not generated. The implementation showed white copy directly over a bright image and lost the intended hierarchy. Corrected the modifiers to valid scale or arbitrary-alpha syntax and recaptured the same stage.
2. P2 — The language switch changed visible text but did not update the document language after an in-page switch. Added synchronized `en` / `zh-CN` document language state and regression assertions.
3. P2 — The mobile navigation used a handcrafted inline SVG. Replaced it with the existing Lucide icon family and retained the accessible menu label.

## Browser verification

- Desktop: sticky recap stage held at the 64 px navigation offset; scroll progress moved from event 1/photo 1 through event 2/final photo; metadata, captions, next preview, photo count, event count, CTA, and progress changed with the active frame.
- Transition: the last recap frame released naturally into Open Events without scroll locking or horizontal overflow.
- CTA path: the visible desktop CTA resolved to the active recap and opened `/recaps/2025-season-finale`.
- Recap detail: the full photo stream rendered; Lightbox opened from the photo button; Arrow Right advanced from photo 1 to 2; Escape closed it and restored focus to the originating photo button.
- Recap index: `/recaps` rendered the editorial two-recap entry layout with working recap links and no horizontal overflow.
- Mobile 390 px: the desktop scrub stage was hidden and two natural chapters were displayed; sticky chapter headings, cover image, metadata, horizontal photo strip, and 44 px-high CTA remained readable with no document overflow.
- EN/ZH: both languages were exercised from the mobile navigation. Titles and CTAs switched without overflow, and the document language changed between `en` and `zh-CN`.
- Reduced motion: the media-query fallback disables the desktop scrub stage, displays the natural chapter sequence, removes animation/transition/transform behavior, and uses automatic rather than smooth programmatic scrolling. Utility tests cover the reduced-motion desktop-selection branch.
- Images: the QA fixture intentionally referenced missing seed images. Every failure switched to the real `/team/group.jpg` community fallback with a visible fallback label; the current image loaded first and later/next images remained lazy through `next/image`.
- Real data state: after removing the temporary QA fixture, the live local page rendered the preserved recap/event empty/error states, kept video autoplay disabled, had no horizontal overflow, and produced zero browser console errors.

## Automated verification

- `npm test`: 94 files, 623 tests passed.
- `npm run test:coverage`: passed; recap components reached 79.63% statement coverage and the reel component reached 95.52%.
- `npm run build`: passed with type and lint checks; only existing `<img>` optimization warnings remain in unrelated components.
- `git diff --check`: passed after line-ending warnings only.

## Local preview harness

- Development-only routes: `/design-preview/home`, `/design-preview/recaps`, and `/design-preview/recap-detail`; `/design-preview` redirects to the homepage preview.
- The routes use existing seed data and the production components, with a floating three-view switcher that is absent from public navigation.
- Production verification returned HTTP 404 for `/design-preview/home`, so the harness cannot expose seed content after deployment.
- Desktop browser verification covered recap frame controls, active preview state, recap index content, recap-detail Lightbox open/close, and EN/ZH switching.
- Mobile verification at 390 px confirmed the natural recap sequence, `375px` document and scroll widths, and a three-column preview switcher with equal `108.6px` targets and no internal horizontal scrolling.
- Mobile QA found and corrected a shrink-to-fit Hero copy container and the initial overflow-scrolling preview switcher before final verification.
- The current `npm test`, `npm run test:coverage`, and `npm run build` all passed. Preview-specific coverage includes the development-only route guard, switcher state and localization, homepage playback behavior, recap frame mapping, reduced-motion selection, image fallback, and recap view rendering.

## Final result

passed

## Checkout and cart follow-up — 2026-10-15

Reference: operator-supplied Backcountry cart and checkout screenshots. Implemented in the existing SnowForce frontend; the comparison concerns the product-list/summary separation, address/delivery/payment hierarchy and compact policy presentation, without introducing unsupported payment methods or changing SnowForce branding.

Browser evidence retained in the operator workspace:

- `output/incidents/2026-10-15-checkout-final-desktop.png`: English desktop at 1,280 px; address card and separate sticky order summary.
- `output/incidents/2026-10-15-checkout-final-policy.png`: full policy opens inside a 320 px scrolling region rather than stretching the checkout. Explicit agreement remains unchecked and payment stays disabled.
- `output/incidents/2026-10-15-checkout-final-mobile-zh.png`: Chinese mobile; summary precedes address, then receiving and payment cards, followed by compact help links. No horizontal overflow.
- `output/incidents/2026-10-15-cart-final-desktop.png`: separated merchandise list and order summary; the quoted USD39 item remains USD39 before shipping and tax when returning from checkout.

Actual flow checks: complete address automatically updates shipping and tax; appointment pickup requires explicit appointment confirmation; dirty address hides the old total and does not report unavailable shipping before validation. The native server returns authoritative prices, tax and ownership. Automatic updates never accept policies or initiate payment. One main landmark remains; labelled inputs, native radio/select/checkbox controls and the keyboard-focusable policy region retain accessible names. Browser console error/warning checks were empty.

Visual repairs found during QA: removed redundant shop navigation and the long site footer from checkout; replaced save/calculate steps with automatic status feedback; corrected stale receiving-mode amounts and merchandise totals including native shipping/tax. Placeholder merchandise art and synthetic fixture policy/contact text are deliberate sandbox content, not production asset acceptance.

Validation: frontend 1,050 tests in 169 files, coverage and production build passed; backend 651 tests, focused payment/tax/pickup/shipping coverage, typecheck and production build passed. The local build still reports an existing dynamic `.data` tracing warning because isolated Postgres fixtures reside in the ignored workspace; tracing exclusions and Docker source allowlists exclude these runtime fixtures. This is not evidence that the new production container is deployed.

Production follow-up: website source `bfa2c7b` is live in deployment `e51f77e7-2d98-44d2-b1c9-a4b62050c2c8`, with GitHub Quality Gate `38805071018` successful. `output/incidents/2026-10-15-checkout-production-desktop.png` confirms the real ski image, USD499/155 cm and actual published policy version 5 in the authenticated production checkout. Production cart/address were not modified. The synthetic auth fixture was removed and sessions revoked; local servers/database are stopped.

Checkout visual result: passed for the inspected desktop/mobile states and production desktop entry. Backend source/region deployment and production automatic-tax performance remain pending checks; no real customer charge was made.
