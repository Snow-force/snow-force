# Friend registration follow-up — 2026-10-23

The friend registration form now displays `hello@snow-force.com` as the event contact with a mailto link in both languages. Authenticated booker identity remains the payment contact internally.

Submission now awaits the server action inside the React transition, keeping the submit and attendee-selection controls disabled until the response arrives. Failed submission retries retain the same request key and answers. Payment action exceptions restore the payment button and explain that the saved registration can be resumed. Submission and payment errors use accessible alerts.

## Verification

- `npm test`: 198 files, 1,318 tests passed.
- `npm run build`: lint, compilation, TypeScript and static generation passed without warnings.
- `npm run test:coverage`: passed; lines 63.94%, branches 59.56%. Focused form coverage includes delayed responses, preserved request keys, network failures and payment retries.
- Isolated PostgreSQL acceptance: 16 groups passed, including real Next form → server action → PostgREST → database → payment-step UI for the current full-prepay/approval, deposit/approval and deposit/no-approval combinations.
- Friend email was tested both omitted and supplied. No friend waiver was signed by the booker. No production test registrations or charges were created.

The reported submission error did not include its exact text. Read-only production inspection found saved pending friend registrations without checkout attempts; this does not establish the cause of every reported failure. The verified changes address premature submission completion and unrecoverable payment errors.

## Production verification

Production `snowforce-web` now follows `Snow-force/snow-force` branch `main` with no commit pin; future pushes deploy automatically. Railway deployment `495aedc9-5380-48ac-9259-a55f1b25c494` successfully deployed source commit `4d5088f219e06366868ab0244d50318ae1d63e75` in `sfo`.

The authenticated live friend form visibly shows the new contact mailbox and bilingual copy. All three public event pages passed health, payment-model and approval-flag checks; the invalid guest page retains noindex/no-referrer, and the unsigned Stripe webhook returns 400. The browser reported no errors or mobile overflow. No production test charges or registrations were created.

The existing unrelated Railway patch `b2de2a43-2321-441f-91c2-d7a0550ff591` remains staged with its original three changes. Event rollout flags and payment amounts remain as previously released.
