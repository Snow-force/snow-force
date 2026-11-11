# Trip desk integration implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Track steps with checkboxes.

**Goal:** Integrate the user-supplied bilingual trip desk after the image recovery release.

**Architecture:** Pure event-data question matching and answer construction in `src/lib/events/trip-concierge.ts`; accessible conversation UI in `src/components/events/trip-concierge.tsx`. Briefing section events connect citations to visible source content, and registration stays in the existing flow.

**Tech Stack:** Existing Next.js 16, React 19, TypeScript, Tailwind, Vitest and Playwright; no new dependency.

**Spec:** [User-approved patch scope and administrator guidance](../../trip-desk.md).

## Global constraints

- Published event fields only; no invented prices, refunds, grouping guarantees or beginner eligibility.
- Keep EN/ZH, existing registration/payment logic and the selected screenshot design.
- Preserve the completed image recovery release; no database changes or new infrastructure.

## Review focus

- Mixed refund/deposit questions must lead to refund terms.
- Empty list modules must not expose hidden paragraph content.
- Prices and availability must respect approval and deadline rules.
- Citations must reveal the exact evidence used in each answer.
- Mobile dialog focus, background inertness and scroll cleanup must work on every exit.

## Task 1: Grounded answer engine

Files: create `src/lib/events/trip-concierge.ts` and its test; update `availability.ts` and its tests for an optional explicit clock.

Interface: retain the supplied topic/answer types, `answerConciergeQuestion`, `answerConciergeTopic`, `conciergeGreeting` and briefing section event helpers.

- [ ] Apply the supplied engine tests, observe the missing-feature failure, then integrate the engine.
- [ ] Add failing regressions for refund priority, list/paragraph visibility, approval claims, explicit clock/deadlines and missing level guidance.
- [ ] Correct the engine and run focused tests until green.

## Task 2: Conversation and citations

Files: create `src/components/events/trip-concierge.tsx` and its test; update `event-briefing.tsx`, `event-detail-view.tsx` and their focused tests.

Interface: retain `TripConcierge({ event })` and `requestBriefingSection(section)`. Keep the desktop panel non-modal; make the full-screen mobile panel modal with focus containment and background cleanup.

- [ ] Apply the supplied component tests and UI after observing the missing-feature failure.
- [ ] Add failing regressions for mobile Tab/Escape, body scroll/inert state, source/registration focus and visible cited evidence.
- [ ] Correct the UI and citations; verify EN/ZH, reduced motion and closed-registration behavior.
- [ ] Run `npm test`, `npm run test:coverage`, `npm run build` and desktop/mobile browser journeys.
- [ ] Review the complete diff, commit, publish a PR, merge the authorized change and verify the production release.
