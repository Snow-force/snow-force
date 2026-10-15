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
