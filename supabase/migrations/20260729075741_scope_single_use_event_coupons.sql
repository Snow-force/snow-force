alter table public.event_coupon_codes
  add column if not exists event_slug text references public.events(slug) on delete cascade;

alter table public.event_coupon_codes
  alter column max_redemptions set default 1;

update public.event_coupon_codes
  set max_redemptions = 1
  where max_redemptions is distinct from 1;

alter table public.event_coupon_codes
  alter column max_redemptions set not null;

alter table public.event_coupon_codes
  add constraint event_coupon_codes_single_use_check check (max_redemptions = 1);

create index if not exists idx_event_coupon_codes_event_slug
  on public.event_coupon_codes(event_slug);

create unique index if not exists registrations_coupon_code_used_once
  on public.registrations(coupon_code)
  where coupon_code is not null;
