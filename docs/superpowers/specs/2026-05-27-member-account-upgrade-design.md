# Member Account Upgrade Design

## Summary

SnowForce will upgrade the current lightweight member page into a coherent member account experience. The work covers account recovery, email verification guidance, password changes, a structured member profile, improved registration history, and mobile-responsive layout polish.

The member area should remain practical and trustworthy rather than decorative. Public discovery pages can carry more brand energy, but account flows must reduce uncertainty for riders who need to register, reuse profile details, and recover access before an event.

## Goals

- Add a forgot-password flow backed by Supabase Auth password recovery.
- Add a reset-password page for recovery-link sessions.
- Add signed-in change-password support.
- Make email verification states and post-registration guidance explicit.
- Improve the signed-in member dashboard structure.
- Improve registration history so it is more useful than a slug/status list.
- Make member account pages mobile-first and bilingual-friendly.
- Keep Supabase service-role or secret credentials out of client components.
- Preserve the existing server-action pattern for member mutations.

## Non-Goals

- Replacing Supabase Auth with a custom auth system.
- Reworking staff/admin authentication.
- Building social login.
- Building payment, cancellation, or waitlist workflows.
- Adding Supabase Storage upload UI.
- Adding direct client writes to registrations or profiles.
- Creating a full notification center.

## Chosen Approach

Use a full member-account upgrade rather than separate auth-first or dashboard-first slices. The current member experience is concentrated in `src/app/member/page.tsx`, while member auth mutations are centralized in `src/lib/members/actions.ts`. A coherent pass can split the page into focused components and add the missing auth routes without duplicating account UI.

Routes:

- `/member`: unauthenticated login/register surface or signed-in dashboard.
- `/member/forgot-password`: request a password recovery email.
- `/member/reset-password`: set a new password after the Supabase recovery link establishes a session.

The first implementation should avoid extra routes for profile or security unless the resulting `/member` page becomes too dense. Signed-in profile, security, and registration history can be rendered as sections on the member dashboard.

## User Experience

### Unauthenticated Member Entry

The unauthenticated `/member` page should present two clear actions:

1. Sign in.
2. Create account.

Requirements:

- Sign-in should be visually first on mobile because returning members are the most time-sensitive users.
- Registration should explain that email verification may be required before login.
- The page should show readable success and error messages from query parameters or action results.
- The login card should include a `Forgot password?` link.
- Copy should be bilingual enough for Chinese community members while keeping compact English helper text where useful.

### Registration and Email Verification

Registration continues to use Supabase Auth `signUp` with an email redirect back to the member area.

Post-registration state:

- Show a success panel telling the user to check their email.
- Explain that they need to verify the email before signing in when confirmation is required.
- Do not imply that the account is immediately usable if Supabase requires confirmation.

Verification guidance:

- If sign-in fails, show copy that covers invalid credentials and unverified email without exposing sensitive details.
- If Supabase supports resend confirmation in the current client API, expose a simple resend-verification action from the unauthenticated page or a secondary form.
- Resend confirmation should use generic success copy that does not reveal whether an email is registered.

### Forgot Password

`/member/forgot-password` should contain a single email form.

Behavior:

- Submit through a server action that calls Supabase password recovery.
- Set the recovery redirect URL to `/member/reset-password` using `NEXT_PUBLIC_SITE_URL` with the current localhost fallback pattern.
- Always show generic success copy such as: if the email is registered, a recovery link has been sent.
- Do not reveal whether the submitted email exists.
- Provide links back to `/member`.

### Reset Password

`/member/reset-password` should let a user set a new password after opening the Supabase recovery link.

Behavior:

- Require a valid Supabase session from the recovery link.
- Show a new-password form with confirmation or clear minimum-length requirements.
- Update the password through Supabase Auth.
- Redirect to `/member` with a success message after completion.
- If no recovery session exists, show a readable expired-link state with a link to request another reset email.

### Signed-In Dashboard

The signed-in `/member` page should become a structured dashboard instead of a single form beside a simple history card.

Sections:

1. Account header.
2. Profile.
3. Security.
4. Registration history.

The account header should include:

- Display name.
- Email.
- Email/account status chip when available from Supabase user data.
- Sign out action.

### Structured Profile

The profile section should group fields by purpose:

- Personal information: display name, phone.
- Rider profile: English and Chinese rider level fields.
- Emergency contact: contact name and emergency phone.

Rules:

- Preserve existing profile fields and repository shape.
- Do not hide Chinese and English rider-level fields behind tabs in this increment; show them side by side on desktop and stacked on mobile.
- Keep the save action local to the profile section.
- Use clear success/error feedback after saving if practical with the current server-action pattern.

### Security Section

The security section should support changing password while signed in.

Requirements:

- Include new password and confirm-password fields with matching validation.
- Submit through a server action that calls Supabase Auth password update.
- Show success and error states without exposing internal Supabase error details.
- Explain that this changes only member login credentials.

### Registration History

Registration history should become a useful account record rather than a raw list.

Display for each registration:

- Event title when resolvable.
- Event slug as fallback.
- Registration status chip.
- Registration date.
- Link to the event detail page when the event still exists and is public.
- A compact summary of submitted registration details if already available on the registration domain model.

Layout:

- Desktop can use a dense list or timeline-like cards.
- Mobile should use stacked cards instead of a cramped table.
- Empty state should link to `/events` and explain that future member-linked signups will appear here.

Implementation note:

- If current registration records only expose `eventSlug`, `status`, and `createdAt`, the first implementation should still improve layout and fallback copy. Event-title enrichment can be added by loading public event summaries where feasible without broad repository rewrites.

## Mobile Responsive Design

Member pages should be mobile-first.

Rules:

- Auth cards stack on mobile.
- Sign-in appears before registration on mobile.
- Dashboard sections stack in this order: header, profile, security, history.
- Buttons become full-width on narrow screens where that improves tap targets.
- Profile field groups use one column on mobile and two columns only when there is enough width.
- History rows become cards with status/date/title hierarchy.
- Focus states remain visible for keyboard and assistive users.

## Visual Direction

Use SnowForce's existing product system:

- Blue is reserved for action, progress, selected state, and links.
- Cards use rounded SnowForce surfaces with subtle borders.
- Avoid gradient text, side-stripe accents, glassmorphism, and generic SaaS dashboard styling.
- Account flows should feel calm and dependable, with small sporty cues through copy and status chips rather than heavy decoration.
- Bilingual strings must remain legible and should not require tiny type to fit.

## Application Architecture

### Server Actions

Extend `src/lib/members/actions.ts` with actions or result helpers for:

- Request password reset.
- Reset/update password from recovery session.
- Change password while signed in.
- Optional resend verification email.

Rules:

- Keep `"use server"` at the top of server-action files.
- Validate form input at the action boundary.
- Use `createClient()` from `src/lib/supabase/server.ts` for session-aware Supabase Auth calls.
- Revalidate affected member paths after successful mutations.
- Redirect with compact success/error query states. If implementation needs inline pending states, use client components only for form presentation while keeping mutations in server actions.

### Components

Split the member UI into focused components under `src/components/members/`.

Suggested components:

- `member-auth-panel.tsx`: unauthenticated login/register surface.
- `forgot-password-form.tsx`: recovery request form.
- `reset-password-form.tsx`: new password form.
- `member-dashboard.tsx`: signed-in account layout.
- `profile-form.tsx`: structured profile editor.
- `security-form.tsx`: change-password form.
- `registration-history.tsx`: improved history list/cards.
- `member-status-message.tsx`: shared success/error message rendering if useful.

The implementation may combine very small components when that keeps the code simpler, but `src/app/member/page.tsx` should stop owning all member UI details.

### Data Loading

`/member` should load:

- Current Supabase user/session through existing member action helpers.
- Member profile through `getCurrentMemberProfile()`.
- Registrations through `getRegistrationsByMember(profile.id)` when signed in.
- Event titles for registration history only if this can be done through existing public repository methods without introducing risky coupling.

If event-title enrichment is deferred, the history component must still render a polished fallback using event slugs.

### Supabase Auth Notes

Implementation must verify current Supabase Auth API signatures before coding. The relevant calls are expected to be around:

- `signUp` for registration.
- `signInWithPassword` for login.
- password recovery email generation.
- user password update.
- resend signup confirmation if available.

Do not rely on stale API assumptions. Check current Supabase docs or local package types before implementing auth changes.

## Error Handling

- Forgot-password requests use generic success copy whether or not an email exists.
- Resend-verification requests use generic success copy whether or not an email exists.
- Login errors should not reveal whether an account exists.
- Password update errors should show user-actionable copy such as invalid/expired link or password too short.
- Profile save errors should not pretend success.
- Missing Supabase configuration should show the current app's existing unavailable/error behavior rather than exposing stack traces.

## Testing

Recommended tests:

- Pure validation helpers for member auth form parsing.
- Server-action result helpers for invalid input, Supabase error, and success paths if actions are hard to test directly.
- Registration history formatting when event title exists and when only slug exists.
- Component-level checks for empty history and populated history if the current test setup supports React component tests.

Final verification:

- Run targeted Vitest tests for changed modules.
- Run `npm test`.
- Run `npm run build`.
- Use a real browser for member-page verification after UI implementation.
- Test mobile viewport rendering for unauthenticated and signed-in states.

## Acceptance Criteria

- A visitor can request a password reset from `/member/forgot-password`.
- A valid recovery-link session can set a new password from `/member/reset-password`.
- A signed-in member can change password from the dashboard.
- Registration explains email verification clearly after signup.
- Login failure copy covers unverified email without leaking account existence.
- Resend verification is available if supported by the current Supabase API and package version.
- Signed-in `/member` has distinct account, profile, security, and history sections.
- Profile fields are grouped into personal, rider, and emergency-contact areas.
- Registration history displays status, date, event title or slug fallback, and useful empty state copy.
- Member account pages work cleanly on mobile and desktop.
- No privileged Supabase key is imported into client components.
- Build and tests pass after implementation, except for any explicitly documented pre-existing failures.
