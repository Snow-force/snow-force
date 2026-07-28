# Refund Policy Page Design

## Goal

Move the full bilingual refund and itinerary-change agreement out of the global footer and into a dedicated public page. Keep a concise `Refund Policy / 退款政策` link in the SnowForce footer column.

## Route and Navigation

- Add the public route `/refund-policy` at `src/app/refund-policy/page.tsx`.
- Change the footer link from the in-page `#refund-policy` anchor to `/refund-policy`.
- Remove the full policy paragraph and its anchor from the footer.
- Keep the footer copyright row unchanged.

## Page Content

The page uses the existing `LanguageProvider` through `useLanguage()` and displays one language at a time.

It contains:

1. A bilingual page title: `Refund Policy / 退款政策`.
2. A short introductory statement that event-specific terms take precedence when explicitly stated.
3. An event-change section covering weather, transportation, venue conditions, public safety, force majeure, other uncontrollable circumstances, and cancellation when minimum group size is not met.
4. A cancellation-fee section with a scannable table:
   - 14–8 days before the event: 50% fee.
   - Within 7 days of the event or on the event day: 100% fee.

## Visual Treatment

- Follow the existing SnowForce public-page system in `DESIGN.md`.
- Use a centered, readable content column with responsive horizontal padding.
- Use the established near-black headings, muted explanatory copy, white surface, soft borders, and blue only for purposeful emphasis.
- Keep the fee table readable on mobile without horizontal scrolling.

## Accessibility and Behavior

- Use semantic headings, paragraphs, and a real HTML table.
- Include table column headers and scoped row/column labels.
- Preserve bilingual switching without duplicating both languages on screen.
- The footer link must work from every route because it uses an absolute application path.

## Verification

- Run `npm run lint`.
- Run the smallest available production/type check; report unrelated missing dependencies separately if they block the build.
- Verify `/refund-policy` renders in both English and Chinese and that the footer link navigates to it.
- Confirm the footer no longer contains the full agreement.
