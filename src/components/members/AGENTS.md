# src/components/members KNOWLEDGE BASE

## OVERVIEW
Client UI for SnowForce member identity: immersive auth gateway, dashboard-first portal, structured profile form, registration history cards. All components access `useLanguage()` for bilingual rendering.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Unauthenticated auth gateway | `member-auth-panel.tsx` | Immersive hero + floating auth card; login/register/magic mode tabs; Google OAuth; forgot password; resend verification. |
| Authenticated member portal | `member-dashboard.tsx` | Consumer dashboard: next trip, recent registrations, quick actions, recaps, profile readiness. Saved events and notifications are currently hidden from member UI. |
| Shared member shell | `member-secondary-shell.tsx` | Dashboard-style chrome for Trips, Profile, and Account Settings pages with desktop side nav and mobile bottom nav. |
| Structured profile editing | `profile-form.tsx` | Rider type/level selects, passes add form, equipment checkboxes, emergency contacts, social handles. |
| Registration history cards | `registration-history.tsx` | Event-linked cards with status pills, payment/waitlist badges, answer summary. |
| Status message display | `member-status-message.tsx` | Maps URL search params to success/error copy for member, forgot, and reset scopes. |
| Security/password form | `security-form.tsx` | Change password via server action; rendered under `/member/account-settings`, not the profile page. |

## CONVENTIONS
- Components use `useLanguage()` + bilingual `t()` calls for EN/ZH strings.
- Auth gateway uses video hero background (`/videos/snowmountain.mp4`) — fallback: dark charcoal surface.
- Forms call server actions directly from `src/lib/members/actions.ts`.
- Styling uses SnowForce design tokens: `#005bea` member blue, `#f6f7fb` background, `rounded-[28px]` cards, `auth-input` component class.
- Profile form separates passes and equipment into independent forms with their own server actions.

## ANTI-PATTERNS
- Do not import Supabase clients in these components.
- Do not add gradient text, side-stripe accents, or glassmorphism as defaults.
- Do not show login and register forms side by side; login is default, register requires mode switch.
- Do not place profile forms above dashboard content in the logged-in view.
