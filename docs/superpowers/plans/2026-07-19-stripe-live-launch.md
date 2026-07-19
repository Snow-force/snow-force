# Stripe Live Production Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move SnowForce's Stripe payment flow from verified Test Mode to production-ready Live Mode with card-only Checkout, deployed production configuration, and a refundable $1 live transaction QA.

**Architecture:** Keep the existing Stripe integration and webhook state machine unchanged except for explicitly restricting Checkout to `card` payment methods. Production receives Live Mode keys and a Live webhook signing secret; local, Development, and Preview stay on Test Mode. The real-money QA happens through Stripe Hosted Checkout so card data never enters the repo, shell, logs, or chat.

**Tech Stack:** Next.js 14 App Router, TypeScript, Vitest, Stripe Node SDK, Stripe CLI, Vercel CLI, Supabase-backed registration repositories.

---

## File Structure

- Modify `src/lib/payments/actions.test.ts`: add a failing-first assertion that Checkout Session creation includes `payment_method_types: ["card"]`.
- Modify `src/lib/payments/actions.ts`: add the minimal `payment_method_types: ["card"]` parameter to `checkout.sessions.create()`.
- No database migration is needed.
- No webhook code change is needed because card-only Checkout does not require delayed-payment events.
- Operational inputs come from `C:\Project\snow-force\.stripe-live.env`, which must be deleted after Vercel Production is configured.

---

### Task 1: Add Failing Test for Card-Only Checkout

**Files:**
- Modify: `src/lib/payments/actions.test.ts`

- [ ] **Step 1: Add the failing assertion**

In the existing test named `creates a checkout session for a deposit event in USD`, update the `expect(sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({ payment_method_types: ["card"] }))` block so it includes `payment_method_types: ["card"]`:

```ts
expect(sessionsCreate).toHaveBeenCalledWith(
  expect.objectContaining({
    payment_method_types: ["card"],
    line_items: [
      expect.objectContaining({
        price_data: expect.objectContaining({
          currency: "usd",
          unit_amount: 12000,
        }),
      }),
    ],
  }),
);
```

- [ ] **Step 2: Run the target test and verify RED**

Run:

```bash
npm test -- src/lib/payments/actions.test.ts -t "creates a checkout session for a deposit event in USD"
```

Expected: FAIL because the actual Stripe Checkout parameters do not yet include `payment_method_types`.

---

### Task 2: Add Minimal Card-Only Checkout Implementation

**Files:**
- Modify: `src/lib/payments/actions.ts`
- Test: `src/lib/payments/actions.test.ts`

- [ ] **Step 1: Add the minimal production change**

In `createCheckoutSessionResult()`, add `payment_method_types: ["card"],` directly inside the Checkout Session create parameter object:

```ts
const session = await deps.getStripe().checkout.sessions.create({
  mode: "payment",
  payment_method_types: ["card"],
  line_items: [
    {
      price_data: {
        currency,
        product_data: { name: event.title.en || event.title.zh },
        unit_amount: unitAmount,
      },
      quantity: 1,
    },
  ],
  success_url: `${siteUrl}/member?payment=success&session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${siteUrl}/events/${event.slug}?payment=cancelled`,
  metadata: {
    pendingRegistrationId,
    eventSlug: event.slug,
    memberId: pending.memberId ?? "",
    paymentModel: event.paymentModel,
    amount: String(amount),
    currency,
  },
  expires_at: Math.floor((Date.now() + 30 * 60 * 1000) / 1000),
});
```

- [ ] **Step 2: Run the target test and verify GREEN**

Run:

```bash
npm test -- src/lib/payments/actions.test.ts -t "creates a checkout session for a deposit event in USD"
```

Expected: PASS.

- [ ] **Step 3: Run the payment test file**

Run:

```bash
npm test -- src/lib/payments/actions.test.ts
```

Expected: all tests in `actions.test.ts` pass.

---

### Task 3: Verify Code Quality and Commit Card-Only Change

**Files:**
- Verify: `src/lib/payments/actions.ts`
- Verify: `src/lib/payments/actions.test.ts`

- [ ] **Step 1: Run TypeScript diagnostics on changed files**

Run LSP diagnostics if available:

```text
lsp_diagnostics src/lib/payments/actions.ts
lsp_diagnostics src/lib/payments/actions.test.ts
```

Expected: no new diagnostics caused by this change. If TypeScript LSP is unavailable in this environment, record that and rely on build/test gates below.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: Vitest exits 0.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: Next build exits 0.

- [ ] **Step 4: Inspect git diff**

Run:

```bash
git diff -- src/lib/payments/actions.ts src/lib/payments/actions.test.ts
git status --short
```

Expected: only the two payment files are modified.

- [ ] **Step 5: Commit the code change**

Run:

```bash
git add src/lib/payments/actions.ts src/lib/payments/actions.test.ts
git commit -m "fix(payments): restrict Checkout to card payments" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

Expected: one atomic commit containing only the card-only Checkout behavior and its test.

---

### Task 4: Securely Load Live Stripe Keys

**Files:**
- Read-only input: `C:\Project\snow-force\.stripe-live.env`

- [ ] **Step 1: Ask the user to create the temporary key file**

Required file content shape:

```text
STRIPE_SECRET_KEY=<redacted sk_live_ value>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<redacted pk_live_ value>
```

Do not ask the user to paste keys into chat.

- [ ] **Step 2: Validate without printing secrets**

Run from `C:\Project\snow-force`:

```powershell
$envMap = @{}
foreach ($line in [System.IO.File]::ReadAllLines((Join-Path (Get-Location) '.stripe-live.env'))) {
  $trimmed = $line.Trim()
  if ($trimmed -and -not $trimmed.StartsWith('#') -and $trimmed.Contains('=')) {
    $index = $trimmed.IndexOf('=')
    $envMap[$trimmed.Substring(0, $index).Trim()] = $trimmed.Substring($index + 1).Trim().Trim('"')
  }
}
if (-not $envMap['STRIPE_SECRET_KEY'].StartsWith('sk_live_')) { throw 'Live secret key missing or wrong prefix' }
if (-not $envMap['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'].StartsWith('pk_live_')) { throw 'Live publishable key missing or wrong prefix' }
$response = Invoke-WebRequest -Uri 'https://api.stripe.com/v1/account' -Headers @{ Authorization = "Bearer $($envMap['STRIPE_SECRET_KEY'])" } -UseBasicParsing
if ($response.StatusCode -ne 200) { throw "Stripe Live API auth failed: HTTP $($response.StatusCode)" }
$account = $response.Content | ConvertFrom-Json
if ($account.livemode -ne $true) { throw 'Stripe account response is not Live Mode' }
'Stripe Live keys validated without printing secret values'
```

Expected: prints only the success sentence.

---

### Task 5: Create or Confirm Live Webhook Endpoint

**External system:** Stripe Live Mode

- [ ] **Step 1: List current Live webhook endpoints**

Run:

```powershell
stripe webhook_endpoints list --live --limit 100
```

Expected: inspect for `https://snow-force.com/api/stripe/webhook`.

- [ ] **Step 2: Ensure there is exactly one enabled Live endpoint for SnowForce**

If no endpoint exists, create it:

```powershell
stripe webhook_endpoints create --live --url "https://snow-force.com/api/stripe/webhook" --enabled-events checkout.session.completed
```

If one endpoint already exists, confirm it is enabled and includes `checkout.session.completed`.

- [ ] **Step 3: Capture the Live webhook signing secret securely**

If a new endpoint was created, capture the returned `secret` value. If using an existing endpoint, reveal/copy its signing secret from Stripe Dashboard Workbench. Do not print the value in final output.

Expected secret prefix: `whsec_`.

---

### Task 6: Configure Vercel Production Only

**External system:** Vercel project `snow-force`

- [ ] **Step 1: Inspect current Vercel Stripe variables**

Run from `C:\Project\snow-force`:

```powershell
vercel env ls
```

Expected: Development/Preview Test Mode keys remain present; Production Stripe variables are ready to replace with Live values.

- [ ] **Step 2: Add or replace Production variables**

Use Vercel CLI non-interactively if supported, otherwise use Vercel Dashboard. Configure only Production for:

```text
STRIPE_SECRET_KEY=<redacted sk_live_ value>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<redacted pk_live_ value>
STRIPE_WEBHOOK_SECRET=<redacted whsec_ value>
```

Do not change Development or Preview values.

- [ ] **Step 3: Verify Vercel variable names only**

Run:

```powershell
vercel env ls
```

Expected: the three Stripe variables exist for Production. Values remain encrypted and must not be printed.

- [ ] **Step 4: Delete the local temporary key file**

Run:

```powershell
Remove-Item -LiteralPath "C:\Project\snow-force\.stripe-live.env"
```

Expected: no secret handoff file remains.

---

### Task 7: Push Source and Deploy Production

**Files:**
- Commits already include the design spec and card-only code change.

- [ ] **Step 1: Push the branch**

Run:

```bash
git push
```

Expected: branch push succeeds. If upstream is `origin/Preview`, verify whether this branch's deployment workflow expects that upstream before pushing; do not force-push.

- [ ] **Step 2: Deploy production**

Run from `C:\Project\snow-force` after pulling or ensuring it contains the pushed commits:

```powershell
vercel --prod
```

Expected: production deployment succeeds and returns a deployment URL.

- [ ] **Step 3: Smoke-test public pages**

Run:

```powershell
curl.exe -sS -o NUL -w "%{http_code}" "https://snow-force.com/"
curl.exe -sS -o NUL -w "%{http_code}" "https://snow-force.com/member"
```

Expected: HTTP 200 for both.

- [ ] **Step 4: Verify webhook signature guard**

Run:

```powershell
curl.exe -sS -o NUL -w "%{http_code}" -X POST -H "stripe-signature: invalid" --data "{}" "https://snow-force.com/api/stripe/webhook"
```

Expected: HTTP 400.

---

### Task 8: Prepare $1 Live Transaction QA

**External systems:** SnowForce admin, Supabase-backed production data, Stripe Live Mode

- [ ] **Step 1: Identify a QA-safe paid activity**

Prefer an existing 1 USD paid activity. If none exists, create a temporary published event with:

```text
Title: Stripe Live QA - Temporary
Payment model: Deposit
Deposit amount: 1
Currency: USD
Registration: open
Capacity: 1
Copy: clearly states this is a temporary internal payment test
```

Expected: event has a public slug and member registration path.

- [ ] **Step 2: Confirm member account readiness**

Use a real member account with a verified email. If no account is available, ask the user to create/verify one before continuing.

- [ ] **Step 3: Stop before real charge confirmation**

Ask the user to confirm they accept a real $1 card charge and possible non-refundable Stripe processing fee. Do not proceed to Checkout card entry without this confirmation.

---

### Task 9: Execute Live Payment and Verify Webhook

**External systems:** Browser, Stripe Hosted Checkout, Vercel logs, Stripe Dashboard/API, production DB/admin

- [ ] **Step 1: Drive browser to the paid event as the verified member**

Use the production site in a browser. Navigate to the event, submit registration, and click the payment button.

Expected: redirects to `https://checkout.stripe.com/{session-path}` in Live Mode.

- [ ] **Step 2: User enters card details in Stripe Hosted Checkout**

Only the user enters card data. The agent must not request, view, log, or store card details.

Expected: Checkout succeeds and redirects to `/member?payment=success&session_id={CHECKOUT_SESSION_ID}`.

- [ ] **Step 3: Verify Vercel production webhook log**

Run:

```powershell
vercel logs --environment production --since 10m --no-branch --query 'path:/api/stripe/webhook' --json --limit 20
```

Expected: a recent `POST /api/stripe/webhook` with HTTP 200.

- [ ] **Step 4: Verify Stripe payment status**

Use Stripe Dashboard or CLI to locate the recent Live Checkout Session / PaymentIntent.

Expected: payment status is succeeded; amount is 1 USD; livemode is true.

- [ ] **Step 5: Verify SnowForce registration outcome**

Use the member dashboard/admin registration view or a controlled Supabase query through the project's existing tooling.

Expected: pending registration has been promoted to a formal registration and finance fields match the Live payment.

---

### Task 10: Refund and Clean QA Data

**External systems:** Stripe Live Mode, SnowForce admin/DB

- [ ] **Step 1: Refund the $1 payment**

Use Stripe Dashboard or CLI with the PaymentIntent/charge ID from Task 9.

Expected: refund succeeds for the full amount.

- [ ] **Step 2: Verify refund status**

Use Stripe Dashboard or CLI.

Expected: refund status is succeeded or pending according to Stripe's normal card refund lifecycle.

- [ ] **Step 3: Clean QA event and registration data**

If a temporary event was created, close/unpublish/archive it through admin tools. Remove or clearly mark the QA registration according to existing admin capabilities. Do not delete unrelated records.

Expected: public site no longer exposes the temporary QA event, and member/admin views are not polluted with the test registration.

---

### Task 11: Final Verification and Handoff

**Files and systems:** Git, Vercel, Stripe, SnowForce production

- [ ] **Step 1: Final git hygiene check**

Run:

```bash
git status --short
git diff --stat
```

Expected: no unintended source changes or debug artifacts. Existing unrelated untracked files in `C:\Project\snow-force` must remain untouched and explicitly called out if still present.

- [ ] **Step 2: Final production evidence check**

Collect non-secret evidence:

```text
- Production deployment URL
- HTTP status for homepage/member page
- Webhook POST HTTP 200 timestamp/request id
- Stripe Live payment succeeded identifier suffix only, never full secret values
- Refund identifier suffix/status
```

- [ ] **Step 3: Final response**

Report:

```text
- Code change commit hash
- Design commit hash
- Test/build commands and pass lines
- Production env configured without exposing values
- Live webhook configured for checkout.session.completed
- Live payment/refund QA result
- Any limitations or cleanup items
```
