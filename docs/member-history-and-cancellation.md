# Member history and paid registration cancellation

## Behavior

Cancelling a registration releases its seat; it does not send money. Refunds
remain behind `requireSuperAdmin()` and the separate `REFUND` confirmation.
Cancelling an unrefunded paid registration now also requires the admin role.
Every cancellation validates `CANCEL` on the server. The admin table explicitly
identifies cancelled registrations whose paid amount has not been fully refunded.
Member history and event capacity pages are invalidated after cancellation.

Google sign-in explicitly requests account selection. Supabase automatically
links supported identities with the same verified email; an empty trip history
does not by itself mean that Google created a different account.

Legacy registrations can have a matching contact email but no member or booker
ID. After authenticated account lookup and privacy acceptance, recovery links
only rows meeting **all** these conditions:

- The Auth session email is verified and matches the profile email.
- The profile belongs to the authenticated user.
- Both member and booker IDs are null.
- The registration source is `legacy` and kind is `self`.
- Contact email matches the verified email, case-insensitively. LIKE pattern
  characters are escaped; dots, plus tags, and domains are preserved.

Recovery sets only the member and booker IDs. It does not merge Auth users,
overwrite profiles, transfer owned registrations, claim proxy registrations,
change payment/status/waiver evidence, or send a refund. Errors are surfaced
rather than silently reporting successful recovery. Existing unique registration
constraints remain in force; a conflict requires staff review.

This requires no schema migration. Deploying the code enables recovery on the
member's next authenticated account lookup, including existing sessions. A source
rollback does not undo associations already recovered.

## Google authorization screen name

Website button text does not control Google's consent-screen branding. In the
Google Cloud project associated with the configured OAuth client:

1. Open Google Auth Platform → Branding.
2. Set the application name to `SnowForce`, and check its home, privacy-policy,
   terms, support, and authorized-domain settings against the actual website.
3. Complete Google's brand verification if required. Google controls review time.
4. Test a fresh sign-in from the website and verify both the displayed brand and
   existing member history. If the long text is the Supabase project hostname,
   inspect the custom-auth-domain option separately; do not change the Supabase
   endpoint or OAuth callback URL without configuring and testing that domain.

References: [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google),
[identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking),
[Google Branding](https://console.cloud.google.com/auth/branding).

## Verification

Run `npm test`, `npm run test:coverage`, and `npm run build` before release.
Focused tests cover direct-action cancellation authorization, server confirmation,
failed writes, invalidation, recovery ownership restrictions, verified email and
profile checks, literal email matching, and Google account-selection guidance.

Production read-only checks cannot establish which staff member cancelled an
older record unless a separate audit trail exists. A screenshot of cancellation
does not establish whether Stripe refunded the payment; check the refund ledger.
