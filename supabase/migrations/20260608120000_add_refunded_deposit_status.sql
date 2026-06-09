alter table public.registrations
  drop constraint if exists registrations_deposit_status_check;

alter table public.registrations
  add constraint registrations_deposit_status_check
  check (deposit_status in ('pending', 'paid', 'refunded', 'waived'));
