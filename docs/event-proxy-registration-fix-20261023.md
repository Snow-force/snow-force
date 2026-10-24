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

## Deployment intent

Production `snowforce-web` should follow `Snow-force/snow-force` branch `main` with no commit pin. The existing unrelated Railway staged region/configuration patch must remain staged. Event rollout flags and payment amounts remain as previously released.
