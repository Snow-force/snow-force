# Homepage departure refinement

Approved in chat on 2026-11-17: preserve the mountain-video homepage and improve the homepage-to-event entry path.

## Intent and constraints
Help riders scan the next event and reach its details, especially on phones. Base: GitHub main ff79432b2363950f8b79355dca24166170015c59. Keep the hero, bilingual facts, real prices, registration state, fallback recovery and cached discovery boundaries. No payment, data, dependency, admin or deployment changes.

## Approaches
The user chose refinement of the existing homepage over a mobile-registration project or a new visual direction. This preserves the latest visual identity and bounds risk to discovery presentation.

## Design
Show the entire event poster without cropping or overlaying its text. On desktop, balance the poster with a clear title, date, venue, fee and detail button. On phones, put those actionable details before the poster, with the same semantic reading order. Make the poster a second accessible route to the same event. Keep empty/error states honest and recoverable. Remove redundant decorative departure eyebrows; preserve the remaining homepage identity.

## Evidence and limits
The live Mammoth poster says November 26–29 while structured discovery shows November 25. Preserve the source values and flag this editorial discrepancy; design work cannot establish the intended date. Covers can be portrait or landscape, missing or broken. Verify both languages, narrow layouts, focus and lazy loading.
