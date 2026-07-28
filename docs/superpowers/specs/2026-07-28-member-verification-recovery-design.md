# Member Email Verification Recovery

## Context

After a member registers, Supabase sends a verification email containing a one-time code exchange link. When the member clicks that link, the `/auth/callback` route exchanges the code for a session. If the exchange fails, the route redirects to `/member?error=callback`.

Two failure modes produce this state in practice:

1. The link has expired. Supabase verification tokens have a configurable TTL (default 1 hour in the hosted project settings; this increment does not change that setting). After expiry, `exchangeCodeForSession` returns an error.
2. The link has already been consumed. The OTP is single-use. A second click, or a click after the email was prefetched by a mail client scanner, produces the same error.

The server cannot distinguish these two cases. The `otp_expired` error from Supabase covers both elapsed and consumed tokens. Email prefetch by corporate gateways or antivirus scanners is a documented cause of premature consumption. Template or OTP-lifetime mitigation is out of scope for this increment.

The current UI shows a generic "sign-in link expired" alert via `MemberStatusMessage` when `?error=callback` is present. The existing compact resend form at the bottom of the card remains available but is visually disconnected from the alert. A member who lands on this state has no clear path forward.

## Goals

- Give members who land on `?error=callback` a visible, labeled resend form directly below the alert so the recovery path is obvious.
- Keep the compact resend affordance in the normal (non-error) state for members who want to request a fresh verification email without first registering.
- Preserve anti-enumeration: the server must not reveal whether an email is registered, confirmed, or unknown.
- Keep `member-auth-card.tsx` below the 250 pure-LOC ceiling by extracting the resend form into a dedicated component.

## Non-Goals

- Changing the email template, OTP lifetime, or token format. Supabase controls these.
- Storing or prefilling the email address via URL parameters, localStorage, or session storage. The member must type the email each time.
- Automatic resend on page load. Every resend requires an explicit form submission.
- Client-side Supabase imports. All `auth.resend` calls remain in the server action.
- Client-side hash fragment parsing. The configured `/auth/callback` route already produces the server-visible `?error=callback` search parameter for the reported production URL; no client-side hash parsing is needed or added.
- Modifying the `/auth/callback` route. The `?error=callback` search param it already produces is the sole trigger for the prominent resend state.
- Redesigning the auth card layout, language switching, or unrelated auth flows.

## Constraints

- Supabase Auth `resend` returns a successful response for unknown emails, already-confirmed emails, and unconfirmed emails alike. The server action must not branch on account state.
- The server action already calls `supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo } })`. The `emailRedirectTo` must continue to point at the `/auth/callback` route with a sanitized `next` path.
- Rate limiting is enforced by Supabase. The server action maps 429 and rate-limit error codes to a distinct redirect code so the UI can show wait feedback.
- The `member-auth-card.tsx` file has 221 physical lines currently. The 250-line ceiling leaves room for small additions but the resend form extraction is required to stay within bounds as the component grows.
- All user-facing copy must be bilingual (EN/ZH) through the existing `useLanguage()` mechanism.
- The resend form must work with JavaScript disabled (progressive enhancement via native form submission to the server action).
- The installed `react-dom@18.3.1` runtime does not export `useFormStatus`. Pending feedback therefore uses local React state set by `onSubmit` without preventing the native form action.

## Approved UX

### Normal State (no `?error=callback`)

The existing compact resend form remains at the bottom of the auth card. It is a single-line inline form: an email input with a screen-reader-only label ("Resend verification email" / "重新发送验证邮件") and placeholder text, plus a "Resend" / "重新发送" button. It is visually subordinate to the main auth forms.

### Callback Error State (`?error=callback` present)

The `MemberStatusMessage` component renders an updated error alert when `?error=callback` is present:

- EN: "This verification link has expired or was already used. If you are verifying a new account, use the form below to resend the verification email. Otherwise, sign in or request a new sign-in link."
- ZH: "此验证链接已失效或已被使用。如果你正在验证新账户，请使用下方表单重新发送验证邮件。否则，请登录或请求新的登录链接。"

This copy replaces the previous generic "sign-in link expired" message and explicitly directs verification users to the resend form below while offering alternative paths for other users.

Directly below this alert, the same resend form appears in a prominent variant. This variant has:

- A visible label above the email input: "Resend verification email" / "重新发送验证邮件".
- The email input is a full-width block (not inline).
- The submit button uses the primary button style (`auth-primary-button`), not the subdued border-only style.
- The button shows pending/disabled semantics during submission: text changes to "Sending..." / "发送中..." and `aria-busy="true"` is set.
- The form is visually grouped with the alert so the member sees the problem and the solution together.

### After Successful Resend

The server action redirects to `/member?verificationSent=1`. The `MemberStatusMessage` component shows the existing success message: "If this email is registered, we sent a fresh verification link. Check your inbox (and spam folder)." (EN) / "如果这个邮箱已注册，我们已经重新发送验证邮件。请检查收件箱和垃圾邮件。" (ZH).

The prominent resend form collapses back to the compact variant after the redirect because `?error=callback` is no longer in the URL.

## Component Boundaries

### New Component: `MemberResendVerification`

Location: `src/components/members/member-resend-verification.tsx`

Props:

```typescript
type MemberResendVerificationProps = {
  variant: "compact" | "prominent";
};
```

Responsibilities:

- Render the resend form with the appropriate visual treatment based on `variant`.
- Use a native `<form action={resendMemberVerification}>` element for progressive enhancement.
- Manage local pending state when the native form submits, without calling `preventDefault`, and pass that state to a nested submit button that renders bilingual text ("Resend" / "重新发送" when idle, "Sending..." / "发送中..." when pending) with `aria-busy` and `disabled` attributes.
- Use `useLanguage()` for bilingual labels, placeholders, and button text.

The component is a client component (`"use client"`) because it manages pending state with React state.

### Modified Component: `MemberAuthCard`

The inline resend form at the bottom of `member-auth-card.tsx` (lines 198-209) is replaced with conditional rendering of `<MemberResendVerification>`:

- When `searchParams.error === "callback"`, render `<MemberResendVerification variant="prominent" />` directly after the `<MemberStatusMessage>` block (inside the same `mt-4` container). This keeps the form visually grouped with the alert.
- Otherwise, render `<MemberResendVerification variant="compact" />` at the bottom of the card.

The component is rendered exactly once per page load, never duplicated.

### Server Action: `resendMemberVerification`

Location: `src/lib/members/actions.ts` (lines 247-266)

The server action already implements the core resend call. Extend its error mapping for the new UI contract:

1. Parse the email from `FormData` using `parseMemberEmail`. If validation fails, redirect to `/member?error=verification-email`.
2. Call `supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo } })`. The `emailRedirectTo` is built via `memberCallback("/member")`.
3. If Supabase returns an error:
   - If the error status is 429 or the error code is `over_email_send_rate_limit` or `email_rate_limit_exceeded`, redirect to `/member?error=verification-rate`.
   - Otherwise, redirect to `/member?error=verification-send`.
4. If Supabase returns success (including for unknown or already-confirmed emails), redirect to `/member?verificationSent=1`.

The rate-limit redirect code `verification-rate` and the generic provider error code `verification-send` are new. The `MemberStatusMessage` component must add corresponding messages.

### Modified Component: `MemberStatusMessage`

The `MemberStatusMessage` component is modified in three ways:

1. **Update the `?error=callback` message** to the approved bilingual copy that explains the link has expired or was already used and directs verification users to the form below while offering alternative paths for other users (see Callback Error State section above).

2. **Add a new message branch for `searchParams.error === "verification-rate"`**:
   - EN: "Too many verification emails in a short time. Wait a few minutes and try again."
   - ZH: "短时间内验证邮件发送过多，请稍候几分钟再试。"
   - Tone: `error`. Role: `alert`.

3. **Add a new message branch for `searchParams.error === "verification-send"`**:
   - EN: "Could not send the verification email. Please try again shortly."
   - ZH: "暂时无法发送验证邮件，请稍后重试。"
   - Tone: `error`. Role: `alert`.
   - This message is generic and does not reveal whether the email is registered, confirmed, or unknown.

## Data Flow

```
Member clicks verification link in email
  → /auth/callback?code=...&next=/member
  → exchangeCodeForSession(code) fails
  → redirect to /member?error=callback
  → MemberAuthCard renders with searchParams.error === "callback"
  → MemberStatusMessage shows error alert
  → MemberResendVerification renders in "prominent" variant below alert
  → Member types email and submits form
  → resendMemberVerification server action:
    → parseMemberEmail validates format
    → supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo } })
    → Supabase returns success (indistinguishable for unknown/confirmed/unconfirmed)
    → redirect to /member?verificationSent=1
  → MemberAuthCard renders with searchParams.verificationSent === "1"
  → MemberStatusMessage shows success message
  → MemberResendVerification renders in "compact" variant at bottom of card
```

## Bilingual and Accessibility Behavior

- All user-facing text uses the `useLanguage()` hook and the `{ en, zh }` bilingual pattern. This includes labels, placeholders, button text (idle and pending states), helper text, and status messages.
- The error alert uses `role="alert"` (already implemented in `MemberStatusMessage`).
- The success message uses `role="status"` (already implemented).
- The resend form submit button uses `aria-busy="true"` and `disabled` during pending state (read from the component's local submit state).
- The email input uses `type="email"`, `autocomplete="email"`, and `required`.
- The prominent variant includes a visible `<label>` element associated with the input via `htmlFor`/`id`.
- The compact variant includes a screen-reader-only `<label>` (using the `sr-only` Tailwind class) associated with the input via `htmlFor`/`id`, plus visible placeholder text. The placeholder is bilingual and descriptive.
- Screen readers announce the pending state via `aria-busy` and the success/error messages via `role="status"` / `role="alert"`.

## Security and Anti-Enumeration

- The server action does not query Supabase to check whether the email is registered, confirmed, or unconfirmed before calling `resend`. It calls `resend` unconditionally after local validation.
- Supabase `auth.resend` returns success for all three cases. The server action treats all success responses identically and redirects to the same `?verificationSent=1` URL.
- The email address is not stored in the URL, localStorage, or session storage. The member must type it each time.
- The resend form does not auto-submit on page load. The member must explicitly click the submit button.
- Rate limiting is enforced by Supabase. The server action maps rate-limit errors to a distinct redirect code so the UI can show wait feedback without revealing account state.

## Error Handling

| Scenario | Server Action Behavior | UI Feedback |
|----------|------------------------|-------------|
| Invalid email format (local validation) | Redirect to `/member?error=verification-email` | EN: "Enter a valid email before resending the verification link." / ZH: "请输入有效邮箱后重新发送验证邮件。" |
| Supabase rate limit (429 or rate-limit error code) | Redirect to `/member?error=verification-rate` | EN: "Too many verification emails in a short time. Wait a few minutes and try again." / ZH: "短时间内验证邮件发送过多，请稍候几分钟再试。" |
| Supabase network error or other provider failure | Redirect to `/member?error=verification-send` | EN: "Could not send the verification email. Please try again shortly." / ZH: "暂时无法发送验证邮件，请稍后重试。" |
| Supabase success (unknown email) | Redirect to `/member?verificationSent=1` | EN: "If this email is registered, we sent a fresh verification link. Check your inbox (and spam folder)." / ZH: "如果这个邮箱已注册，我们已经重新发送验证邮件。请检查收件箱和垃圾邮件。" |
| Supabase success (already-confirmed email) | Redirect to `/member?verificationSent=1` | Same success message. The member can then sign in normally. |
| Supabase success (unconfirmed email) | Redirect to `/member?verificationSent=1` | Same success message. The member receives a new verification email. |

The three error cases use distinct redirect codes: `verification-email` for local validation failures, `verification-rate` for rate limits, and `verification-send` for all other Supabase/provider/network errors. The generic provider error message does not disclose account state. The rate-limit error is distinct because it requires the member to wait.

## TDD Cases

### Server Action Tests (`src/lib/members/actions.test.ts`)

The existing test file already covers the resend action. Add the following cases:

1. **Rate-limit error maps to verification-rate redirect**: Mock `parseMemberEmail` to return success. Mock `supabase.auth.resend` to return `{ error: { status: 429, code: "over_email_send_rate_limit", message: "rate limit" } }`. Assert the action redirects to `/member?error=verification-rate`.

2. **Generic Supabase error maps to verification-send redirect**: Mock `supabase.auth.resend` to return `{ error: new Error("network failure") }`. Assert the action redirects to `/member?error=verification-send`.

3. **Success for unknown email maps to verificationSent redirect**: Mock `supabase.auth.resend` to return `{ error: null }`. Assert the action redirects to `/member?verificationSent=1`. (This case already exists; retain it.)

4. **Parser failure maps to verification-email redirect**: Mock `parseMemberEmail` to return `{ success: false, error: "email" }`. Assert the action redirects to `/member?error=verification-email` without calling `supabase.auth.resend`. (This case is currently missing from the test file; add it.)

### Component Tests (`src/components/members/member-auth-card.test.tsx`)

Add the following cases:

1. **Callback error state renders prominent resend form**: Render `<MemberAuthCard searchParams={{ error: "callback" }} />`. Assert the prominent resend form is present with a visible label "Resend verification email" and a primary-style submit button.

2. **Normal state renders compact resend form**: Render `<MemberAuthCard searchParams={{}} />`. Assert the compact resend form is present at the bottom of the card with a screen-reader-only label, placeholder text, and a subdued button.

3. **Prominent resend form shows pending state during submission**: Submit the actual rendered form. Assert the button text changes to "Sending..." / "发送中..." (depending on language), `aria-busy="true"` is set, and the button is disabled. Do not mock a framework hook.

4. **Verification-sent state renders compact resend form**: Render `<MemberAuthCard searchParams={{ verificationSent: "1" }} />`. Assert the success message is present and the compact resend form is at the bottom of the card.

### Status Message Tests (`src/components/members/member-auth-card.test.tsx`)

Add the following cases to the `MemberStatusMessage` describe block:

1. **Verification rate-limit message in English**: Render `<MemberStatusMessage searchParams={{ error: "verification-rate" }} />`. Assert the alert text is "Too many verification emails in a short time. Wait a few minutes and try again."

2. **Verification rate-limit message in Chinese**: Set `document.cookie = "lang=zh;path=/"`. Render `<MemberStatusMessage searchParams={{ error: "verification-rate" }} />`. Assert the alert text is "短时间内验证邮件发送过多，请稍候几分钟再试。"

3. **Verification send error message in English**: Render `<MemberStatusMessage searchParams={{ error: "verification-send" }} />`. Assert the alert text is "Could not send the verification email. Please try again shortly."

4. **Verification send error message in Chinese**: Set `document.cookie = "lang=zh;path=/"`. Render `<MemberStatusMessage searchParams={{ error: "verification-send" }} />`. Assert the alert text is "暂时无法发送验证邮件，请稍后重试。"

5. **Updated callback error message in English**: Render `<MemberStatusMessage searchParams={{ error: "callback" }} />`. Assert the alert text contains "This verification link has expired or was already used."

6. **Updated callback error message in Chinese**: Set `document.cookie = "lang=zh;path=/"`. Render `<MemberStatusMessage searchParams={{ error: "callback" }} />`. Assert the alert text contains "此验证链接已失效或已被使用。"

## Browser QA

Manual verification steps:

1. **Normal state**: Navigate to `/member`. Confirm the compact resend form is visible at the bottom of the auth card with a screen-reader-only label (inspectable via browser dev tools), placeholder text, and a subdued "Resend" / "重新发送" button.

2. **Callback error state**: Navigate to `/member?error=callback`. Confirm the updated error alert is visible (explaining the link has expired or was already used) and the prominent resend form appears directly below it with a visible label, full-width input, and primary-style button.

3. **Resend submission**: Type a valid email in the prominent form and submit. Confirm the button shows "Sending..." / "发送中..." during submission and the page redirects to `/member?verificationSent=1` with the success message.

4. **Rate-limit feedback**: Trigger a rate-limit error (mock in dev or use a real Supabase project with rate limiting). Confirm the page redirects to `/member?error=verification-rate` and the rate-limit message is displayed.

5. **Invalid email**: Type an invalid email (e.g., "not-an-email") and submit. Confirm the page redirects to `/member?error=verification-email` and the format error message is displayed.

6. **Provider error feedback**: Trigger a generic Supabase error (mock in dev). Confirm the page redirects to `/member?error=verification-send` and the generic retry message is displayed without revealing account state.

7. **Bilingual switching**: Switch the language to Chinese. Confirm all resend form labels (including screen-reader-only labels), placeholders, button text (idle and pending states), and status messages are displayed in Chinese.

8. **JavaScript disabled**: Disable JavaScript in the browser. Navigate to `/member?error=callback`. Confirm the prominent resend form is visible and can be submitted via native form action. Confirm the page redirects correctly after submission.

9. **Screen reader**: Use a screen reader to navigate the callback error state. Confirm the error alert is announced with `role="alert"`, the resend form label (visible in prominent variant, screen-reader-only in compact variant) is announced, and the pending state is announced via `aria-busy`.

## Rollout

This is an application-only change with no database migrations, no environment variable changes, and no Supabase configuration changes. The server action already exists and is already called by the existing compact resend form. The change is limited to:

1. Extracting the resend form into a dedicated component.
2. Rendering the component in two variants based on the presence of `?error=callback`.
3. Adding distinct rate-limit and provider-failure redirect codes with corresponding status messages.
4. Updating the callback error copy and moving the prominent variant directly after it.

Deployment requires separate authorization and is out of scope for this spec. After deployment, verify the changes in production by navigating to `/member?error=callback` and confirming the prominent resend form is visible.

No feature flags, no gradual rollout, no database changes.

## Acceptance Criteria

- [ ] The `MemberResendVerification` component exists at `src/components/members/member-resend-verification.tsx`.
- [ ] The component accepts a `variant` prop with values `"compact"` and `"prominent"`.
- [ ] The `member-auth-card.tsx` file is below 250 lines after the extraction.
- [ ] When `?error=callback` is present, the prominent resend form appears directly below the error alert.
- [ ] When `?error=callback` is absent, the compact resend form appears at the bottom of the card.
- [ ] The component is rendered exactly once per page load, never duplicated.
- [ ] The prominent variant has a visible label, full-width input, and primary-style button.
- [ ] The compact variant has a screen-reader-only label, placeholder text, and a subdued button.
- [ ] The form uses native `<form action={resendMemberVerification}>` for progressive enhancement.
- [ ] Native form submission sets local pending state without `preventDefault`; the submit button shows bilingual text ("Resend" / "重新发送" when idle, "Sending..." / "发送中..." when pending) with `aria-busy` and `disabled` attributes.
- [ ] The server action redirects to `/member?error=verification-email` on invalid local email format.
- [ ] The server action redirects to `/member?error=verification-rate` on rate-limit errors.
- [ ] The server action redirects to `/member?error=verification-send` on other Supabase/provider/network errors.
- [ ] The `MemberStatusMessage` component displays the updated callback error message explaining the link has expired or was already used.
- [ ] The `MemberStatusMessage` component displays the rate-limit message for `?error=verification-rate`.
- [ ] The `MemberStatusMessage` component displays the generic retry message for `?error=verification-send`.
- [ ] All user-facing text (labels, placeholders, button text, helper text, status messages) is bilingual (EN/ZH).
- [ ] The server action does not reveal account state in success or error responses.
- [ ] The email address is not stored in the URL, localStorage, or session storage.
- [ ] The resend form does not auto-submit on page load.
- [ ] All TDD cases pass.
- [ ] All browser QA steps pass.
- [ ] `npm run build` succeeds.
- [ ] `npm test` succeeds.
