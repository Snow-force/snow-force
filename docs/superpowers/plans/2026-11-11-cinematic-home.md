# Cinematic Homepage Implementation Plan

> Execute inline with superpowers:executing-plans; preserve the selected visual and existing operational flows.

**Goal:** Implement the user's selected second cinematic design with the existing mountain video, accessible scroll animation, and bounded cached public reads.
**Architecture:** Server-only public summary queries feed a bilingual client homepage. Next Data Cache shares successful anonymous summaries across requests. Local intersection observers and CSS handle motion, with no scroll-triggered fetches.
**Tech Stack:** Existing Next.js 16, React 19, Tailwind, Supabase, Vitest; no new runtime dependencies.
**Spec:** Selected image `/workspace/generated_images/exec-bc75c1d6-26a8-432b-9198-6db3b49772c5.png` and user's requirement to retain hero animation and reduce database egress.

## Global Constraints
- Keep `/videos/snowmountain.mp4`, explicit playback control and bilingual content.
- Native scrolling, visible content without JavaScript, reduced-motion support, mobile layouts.
- Anonymous public reads only; never cache account/auth/payment data.
- At most three event summaries and three recap covers; omit questions, modules, registration records, album media and full article bodies.
- Five-minute server cache; independent failures caught outside caches. Staff publication invalidates the homepage. Homepage never promises exact live seat counts; registration remains authoritative.
- No database schema or deployment changes.

## Review Focus
- Cache failures must not become successful empty cache entries.
- Draft or hidden content must not reach the homepage.
- Videos pause when off-screen and hidden; scroll never starts network work.
- Keyboard, reduced motion and JS-disabled visitors can access all content.
- Event/recap publication and failed media retain usable navigation.

## Tasks
1. Public summary reads: write tests with real Supabase query builder and stub HTTP responses asserting bounded published-only projections; run red, implement `src/lib/home/repository.ts` and summary types, then green. Cache event/recap/shop independently and update `src/app/page.tsx` tests. Add homepage invalidation to recap actions.
2. Cinematic homepage: update focused bilingual tests for the selected heading, live availability disclaimer, media playback/error recovery; run red. Implement hero, dark departure board, light sticky-media story, published recap covers and gear section. Keep all links functional.
3. Motion and validation: test visibility/reduced-motion playback and one-shot reveal cleanup. Add CSS and local observers, progressive enhancement and mobile reduction. Run focused tests, full suite, coverage and build; inspect desktop/mobile in both languages, test video and scrolling for network activity. Review full diff and document results.

## Progress
- Proposal replaced by the user's selected second visual. User authorized implementation and added egress constraint.
- Existing `next-env.d.ts` change was produced by Next dev startup; preserve it unless unnecessary in final diff.
- Baseline has no database credentials, so live database billing reduction cannot be measured here. Verify queries and cache behavior locally; document this limit.

## Completion evidence

- Tasks 1–3 complete in the local `feat/cinematic-home` branch; no deployment or push performed.
- Fresh whole-change review found two issues: recap status-route invalidation and full-event prioritization. Both reproduced with failing tests and fixed; focused tests passed.
- Additional production browser test found legacy footer route prefetch during scroll; disabled it and verified zero fetch/XHR requests across the entire scroll.
- Final `npm test -- --maxWorkers=2`: 253 files, 1709 tests passed, exit 0. Execution used the normal environment because sandboxed child-process stdin stalled an existing Git test; a minimal reproduction established the environment cause.
- Final `npm run build`: lint, compilation, TypeScript and route generation passed, exit 0. Generated dev/build artifacts were cleaned after an earlier generated-validator corruption; no source validators were changed.
- Focused coverage: 29 tests passed, 90% statements / 95.29% lines for the selected instrumented homepage/cache modules. Media cleanup warnings were resolved by cleaning rendered components before restoring browser mocks.
- `node scripts/check-homepage-cache.cjs`: nine visits, one upstream read per source, exit 0.
- `node scripts/check-homepage-browser.cjs`: native motion, reduced motion, five viewport layouts, no page errors and no scroll fetch/XHR traffic, exit 0.
- `design-qa.md`: latest homepage result passed; earlier QA history preserved. Production standalone preview remains on port 3000.
- Ruling: use genuine existing brand/community photographs instead of fictional concept photos; retain the real preparation, recap and commerce flow beyond the image crop. This preserves operational truth and makes the page longer than the concept.
- Ruling: cache only public discovery/contact data for 300 seconds. Availability/checkout stay authoritative. Direct out-of-app data edits wait for timed revalidation; no webhook or schema changes were authorized or needed.

## Mobile framing follow-up

User identified that the previous portrait cover layout cropped the original panorama. Browser regression reproduced 390 × 780px with `cover` (about 28% of the source width visible). Replaced only the phone layout with natural-flow copy/actions, a full 16:9 `contain` video and compact brand/control rows. Production browser checks pass at 320/390/430px, both languages and playback still work, and desktop motion remains intact. Required full suite (1709 tests) and production build both passed again. No data/caching/media-source changes.

## Final mobile preference: immersive framing

The user rejected the separated mobile panel and preferred the first full-bleed treatment. Restored the immersive viewport-height background, kept mobile text/actions compact, and reviewed the actual 15-second clip. Added a small pure focal-position helper tied to native media time, with scene-cut boundaries and reviewed peak/rider/board points. Playback clears mobile copy and reduces decorative lettering; pause restores actions. No new media source, backend call or per-frame React updates.

Validation: the separated layout failed the new immersive-layout browser assertion; the absent framing handler failed its unit test; text visibility during playback failed the browser check before the change. All pass after implementation. Final production browser: 66 subject checks, six viewports, playback/pause/language checks, zero scroll fetch/XHR traffic and zero page errors. Full suite 1716 tests / 254 files and production build exit 0. Focused framing/media coverage has 100% lines. The standalone preview remains running on port 3000.

Ruling: retain some portrait crop to preserve immersion, prioritising the source's reviewed subject instead of displaying every horizontal pixel. Focal coordinates are specific to this clip and must be reviewed if the video changes.
