-- Member-only event registrations with staff-managed deposit and settlement tracking.

alter table public.registrations
  add column if not exists deposit_amount numeric(10, 2),
  add column if not exists deposit_status text not null default 'pending'
    check (deposit_status in ('pending', 'paid', 'waived')),
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists payment_method text not null default '',
  add column if not exists payment_note text not null default '',
  add column if not exists lodging_assignment text not null default '',
  add column if not exists final_amount numeric(10, 2),
  add column if not exists settlement_amount numeric(10, 2),
  add column if not exists settlement_status text not null default 'not_started'
    check (settlement_status in ('not_started', 'pending_balance', 'pending_refund', 'settled')),
  add column if not exists settlement_note text not null default '';

create index if not exists idx_registrations_deposit_status
  on public.registrations(deposit_status);

create index if not exists idx_registrations_settlement_status
  on public.registrations(settlement_status);

create unique index if not exists registrations_one_member_per_event
  on public.registrations(event_slug, member_id)
  where member_id is not null;

create unique index if not exists pending_registrations_one_member_per_event
  on public.pending_registrations(event_slug, member_id)
  where member_id is not null;
