-- Persist Stripe payment identifiers and an immutable audit trail for admin refunds.
-- Refunds are server-only: members and anonymous clients never receive direct table access.

alter table public.registrations
  add column if not exists payment_currency text
    check (payment_currency is null or payment_currency in ('usd', 'cny', 'eur', 'gbp', 'jpy')),
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists refunded_amount numeric(10, 2) not null default 0
    check (refunded_amount >= 0);

create unique index if not exists registrations_stripe_checkout_session_id_unique
  on public.registrations(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists registrations_stripe_payment_intent_id_unique
  on public.registrations(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create table if not exists public.registration_refunds (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete restrict,
  stripe_refund_id text unique,
  stripe_payment_intent_id text not null,
  amount numeric(10, 2) not null check (amount > 0),
  currency text not null check (currency in ('usd', 'cny', 'eur', 'gbp', 'jpy')),
  status text not null check (
    status in ('creating', 'pending', 'requires_action', 'succeeded', 'failed', 'canceled')
  ),
  reason text not null check (reason in ('requested_by_customer', 'duplicate')),
  internal_note text not null,
  initiated_by uuid references auth.users(id) on delete set null,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists registration_refunds_registration_id_idx
  on public.registration_refunds(registration_id, created_at desc);

create index if not exists registration_refunds_payment_intent_id_idx
  on public.registration_refunds(stripe_payment_intent_id);

alter table public.registration_refunds enable row level security;

revoke all on table public.registration_refunds from anon, authenticated;
grant all on table public.registration_refunds to service_role;

comment on table public.registration_refunds is
  'Server-only Stripe refund audit log. A refund always cancels its registration; cancellation alone does not refund.';
