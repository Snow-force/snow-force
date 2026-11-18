# Homepage Departure Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make homepage event facts and the detail action easy to find while showing complete posters.

**Architecture:** Keep HomeDepartures' existing public snapshots and selection state. Change its semantic layout and homepage-scoped CSS, reusing SafeRecapImage and Next links.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS, Vitest.

**Spec:** ../specs/2026-11-17-home-departure-polish-design.md

## Global Constraints
- Base: GitHub main ff79432b2363950f8b79355dca24166170015c59.
- Preserve hero, bilingual facts, prices and honest loading/error/empty behavior.
- No payment, data, dependency, admin or deployment changes.

## Review Focus
- Portrait and landscape posters remain uncropped, including hover.
- Long bilingual titles and venue names wrap without horizontal overflow at 320px.
- No event or a load error exposes no poster link to a fabricated event.
- Keyboard event selection updates both entry links to the chosen slug.
- Image failure keeps the detail action available and loading remains lazy.

## Task 1: Departure presentation and entry path

**Files:** src/components/site/home-departures.tsx, home.css, home-departures.test.tsx.

**Interfaces:** Preserve HomeDepartures({ events: HomeEvent[], loadError: boolean }). Consume existing SafeRecapImage props. Produce linked full-frame posters and details-first semantic order.

- [x] Add focused bilingual tests for linked poster destinations, details before media, selection changes, empty/error recovery, and broken image recovery.
- [x] Run focused tests and observe the missing poster-link failure.
- [x] Put copy before media in DOM, link only real selected-event posters, use contain fit, move caption below media, and refine facts/layout spacing. Desktop keeps media left; mobile keeps copy first.
- [x] Run focused tests, npm test, npm run test:coverage and npm run build with Node >=24.22.1.
- [x] Render the real component on desktop/tablet/phones in EN/ZH; inspect full poster, readable facts, CTA, focus and error states. Review the final diff.

## Execution record
User explicitly approved this design and implementation in chat. Execute inline; no additional process-choice approval is needed. Keep the branch uncommitted until all required checks pass. Preserve unrelated work in the original checkout.

### Verification results
- Node 24.22.1 (official runtime downloaded for this task; system runtime unchanged).
- Baseline: 254 files / 1,716 tests passed. Focused red: four expected failures for the missing poster link. Focused green: 15 homepage tests passed.
- Final: 255 files / 1,722 tests passed; npm run build passed with lint and TypeScript; no warning/error output in final test, coverage or build logs.
- Full coverage passed: 68.89% lines, 63.83% branches overall. Existing payment coverage gaps include refund actions/repository branches and webhook route lines 96, 106, 131; this presentation-only change does not alter those paths.
- Browser: EN/ZH at 320, 390, 768, 1440px; no page overflow; contain-fit poster at every size; copy before poster on phones. Real portrait poster verified visually, including its bottom content. Shared component tests cover missing images and failed fallback.
- Keyboard: Tab from the detail action reaches the poster link with a 3px blue outline. The poster navigates to the correct real event detail page, which loaded successfully with standalone runtime environment configured.
- Production preview uses standalone/server.js with its runtime env file and static/public junctions; no Next processes wrote concurrently to this worktree's .next directory.
- Independent static reviewer found no actionable issues. git diff --check passed.
- Ruling: no new visual-world, backend, dependency or factual-content changes; keep the reviewed edits available on codex/homepage-design-polish for the user's next step.
