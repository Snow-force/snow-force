# SnowForce Activity Platform Design

## Summary

SnowForce will move from an introduction-first website to a bilingual activity
operations site. The first release must help visitors discover current events,
register without leaving the site, browse past event recaps, and optionally
create a lightweight member profile that makes future registrations easier.

The first release is intentionally not a full ticketing or membership benefits
platform. It creates a durable base for later payments, waitlists, member
benefits, training products, and conversion analytics.

## Product Shape

### Public Experience

- The homepage leads with the SnowForce brand, a real activity image treatment,
  current event entry points, and enough community proof to support signup.
- Primary navigation covers current events, past recaps, about/contact content,
  partner inquiries, and member access.
- Current events include an index and detail pages.
- Event details show timing, location, audience level, highlights, schedule or
  activity notes, fee guidance, capacity state, FAQ/notice content, and the
  registration call to action.
- Past recaps include date, place, tags, short narrative, and photo/video media
  so SnowForce can reuse them as trust-building proof across the site.
- The initial public content set keeps only necessary legacy brand/contact
  information from the existing site and does not migrate all existing long-form
  text.

### Registration

- Visitors may register without creating an account.
- Signed-in members may register with saved profile details and later view their
  registration history.
- Each event defines a configurable registration form. The default field set
  includes name, contact details, rider experience level, notes, and required
  consent items.
- Registration submission validates event availability, form requirements, and
  consent before persisting the registration.
- Successful submissions show a confirmation state and trigger a confirmation
  email. A persisted registration must not be lost if a downstream notification
  fails.

### Lightweight Membership

- The first release supports email-based authentication.
- Member profiles store reusable registration details and power a registration
  history view.
- Membership does not include levels, points, exclusive benefits, discounts, or
  entitlement rules in the first release.

### Operations

- Staff use one admin surface to manage events, recaps, FAQs, media, and
  registration records.
- Staff can draft, publish, open, and close event registration.
- Staff can filter and export registrations and distinguish visitor records from
  member-linked records.
- Bilingual fields are managed intentionally. A language variant should not be
  published when required content for that variant is missing.

## Architecture

The implementation should use one full-stack web application so the public site,
member area, and admin surface share routing, types, validation, and data
access. The default stack is Next.js with TypeScript, Supabase for Postgres,
authentication, storage, and row-level policy groundwork, plus a transactional
email adapter for registration confirmations and staff notifications.

The code should separate public content queries, registration domain logic,
member profile access, and staff-only admin operations. The registration service
owns event-state validation, configurable form validation, persistence, and
notification triggering so public pages and future payment flows can reuse the
same rules.

## Core Data

- `Event`: bilingual content, schedule, location, audience/difficulty metadata,
  capacity state, publish state, registration window, registration field config,
  media, and SEO fields.
- `Registration`: event link, optional member link, answers, consent record,
  contact snapshot, status, and timestamps.
- `MemberProfile`: auth user link and reusable registration details.
- `EventRecap`: bilingual recap content, dates, place, tags, media, and publish
  state.
- `FAQItem`, `PartnerInquiry`, and `MediaAsset`: supporting site operations.

## Error Handling And Safety

- Closed, unpublished, unavailable, or invalid events must not accept new
  registrations.
- Registration forms must show actionable validation failures without losing
  user input.
- Public submission endpoints need spam-resistant defaults and server-side
  validation.
- Admin actions must require staff authorization.
- Notification failures should be logged and observable while keeping the saved
  registration available to staff.

## Acceptance Criteria

- Staff can publish a bilingual current event and a bilingual past recap.
- A visitor can find an event from the homepage, submit a site-native
  registration, and receive a clear confirmation result.
- A member can sign in with email, maintain profile data, register with reused
  details, and inspect registration history.
- Staff can inspect, filter, update, and export registrations from the admin
  area.
- Public pages work on mobile and desktop with visible activity-focused calls to
  action.

## Deferred

- Online payment, refunds, and invoicing.
- Waitlists and capacity promotion flows.
- Member benefits, loyalty progression, and exclusive access rules.
- Training/course product specialization beyond event metadata.
- Advanced funnel analytics, couponing, and calendar integrations.
