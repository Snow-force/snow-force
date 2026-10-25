# Waiver age confirmation — 2026-10-24

**2026-10-25 activation:** the operator explicitly requested “开启”; [all three current events are now enabled](event-group-registration-enabled-20261025.md) with published adult/guardian R1 terms. The earlier default-off state below is retained as release history.

The user clarified that age is confirmed when signing the waiver: checking “I am 18 or older” permits personal adult signing without a guardian signature. This supersedes deriving the role for new bookings from a collected birth date.

## New booking and signing flow

- The group form collects the participant's activity answers and signing email. Use the adult attendee's own email, or the parent/legal guardian's email for a minor. New bookings do not collect or store a birth date, guardian name or booker-provided age assertion. Recipient age/role remains unconfirmed until signing.
- The designated email must still be verified with its own one-time code. At signing the 18+ checkbox starts unchecked. Checking it displays adult terms, hides guardian fields and permits the attendee's own signature. There is no additional guardian signature/review requirement for an adult solely because a friend booked the place; independent payment, event approval and duplicate-identity review still apply.
- With the box unchecked, a parent/legal guardian signs using their own legal name and confirms legal authority. They declare whether the participant will be under 14 during the activity. Under 14 still requires a qualifying accompanying adult, contact details, a commitment to stay throughout and staff presence verification. Guardian authority review remains separate from event approval and accompaniment.
- Changing between adult and guardian terms clears the typed signature and consent checkboxes so acceptance of one version cannot silently carry over to another. A recipient may decline without completing age/guardian details; no automatic refund occurs.
- The server derives the new signing role from the explicit checkbox, ignoring a forged hidden role field. SQL independently validates the declaration, proof, current policy, adult's own name/email and guardian authority/under-14 details. The selected canonical text/hash and age declaration are sealed in immutable signature evidence at the existing signing timestamp.
- Adult friends cannot use their booker's signing email or member identity to impersonate the attendee. A parent/booker may use their own email when genuinely signing as guardian. This is a self-declaration of age, not a claim that the platform has verified a birth certificate.

## Compatibility and privacy

Existing birthday-based participant snapshots/signatures remain unchanged and continue through the historical signing path. No birth date is fabricated, no historical evidence is rewritten, and existing V1 registrations/payments are preserved. The new participant method enforces `date_of_birth IS NULL`; new assignments start with an unconfirmed role. The legacy response RPC explicitly refuses declaration-based participants so it cannot bypass the new process.

The privacy notice and new invitation instructions describe age confirmation at signing without requesting a birth date. For new bookings the earlier request to choose a birth-date retention period no longer applies. Guardian contact and signature-evidence retention plus the designated real-email acceptance recipient remain separate activation inputs. None are invented by this change.

[Guardian draft D2](event-waivers-20261024/guardian-age-declaration-en-zh.review-draft.txt) aligns the signing-age wording and removes the request to check a child's birth date. The D1 file is preserved as history; D2 remains a review draft and is not represented as lawyer-approved.

## Validation

- `npm test`: 217 files / 1,400 tests passed; `npm run build`: ESLint, production compilation and TypeScript passed without warnings.
- `npm run test:coverage`: passed, total lines 65.39%; the new age-declaration parser/booking validator has 100% line coverage.
- Isolated PostgreSQL acceptance verifies no-DOB storage, ignored booker age claims, verified adult signing with no guardian, unchecked-box guardian requirements, canonical terms, immutable age evidence, missing/replayed proof rejection, denied anonymous/member RPC access, and under-14 presence/departure gates.
- Real local browser acceptance verifies the 18+ checkbox, no guardian fields for adults, parent signing for a child, preserved verification across refresh and all three current payment/approval combinations. No external emails, real charges or production test bookings were used.

The existing three activities' prices, approval flags, friend caps and V2 enrollment flags are unchanged. This age-flow correction is not a claim that public V2 enrollment has opened. Production release verification will be appended after deployment.

## Verified release

- [PR #44](https://github.com/Snow-force/snow-force/pull/44), source `21eb07ef369dfaa5ac842b4d630b8fd93eac6322`, passed [GitHub Quality Gate run 108](https://github.com/Snow-force/snow-force/actions/runs/40168250479) before merge. Application revision on main: `86990e85695be96a68e66669872db16ccc088c74`.
- The schema expansion was applied as remote migration **20261025061134 — event_waiver_age_declaration**. Its local file is `20261025055638_event_waiver_age_declaration.sql`; do not replay it as another migration. Read-back confirmed nullable DOB with method constraints, both new RPCs as security invoker, no anonymous/member execute grants, and zero V2 bookings/enabled events.
- Railway web deployment **c4cb1463-1b64-4c95-8714-855965a0b729** is SUCCESS, actual region **sfo**, one healthy running replica and no service warning/critical. Source remains `Snow-force/snow-force`, main, root `/`, with no commit pin. Only the specific commit deployment was approved.
- [Production smoke evidence](../output/event-waiver-age-confirmation-smoke-20261024.json), verified `2026-10-25T06:26:59Z`: health, private waiver entry, legacy invalid invitation, updated privacy notice and all three event pages returned 200. Unauthenticated dispatch returned 401; unsigned provider callback returned 400. The new booking RPC rejected an invalid event before writes; the new signature RPC rejected a missing invitation/proof before writes. This also verifies that the Data API recognizes both new RPCs. No production test booking, real email or payment was created.
- [Deployment proof](../output/event-waiver-age-confirmation-deployed-20261024.jpg). The dashboard region label includes staged changes; actual deployment metadata remains sfo. Unrelated patch `b2de2a43-2321-441f-91c2-d7a0550ff591` retains its same three region/shop changes and original update timestamp; it was not accepted.
- Security advisor categories remained unchanged. The existing server-only RLS notice is explained by [Supabase's RLS advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy); the existing unrelated password warning is covered by [password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Both public V2 flags remain false on all three current activities. This release changes the prepared signing rules; retention/access rules for guardian contacts and signature evidence plus authorized real-email acceptance remain activation inputs.
