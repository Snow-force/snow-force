alter table public.event_coupon_codes
  drop constraint if exists event_coupon_codes_single_use_check;

alter table public.event_coupon_codes
  drop constraint if exists event_coupon_codes_max_redemptions_upper_check;

alter table public.event_coupon_codes
  add constraint event_coupon_codes_max_redemptions_upper_check
  check (max_redemptions <= 100000);

drop index if exists public.registrations_coupon_code_used_once;

drop index if exists public.idx_registrations_coupon_code;

create index idx_registrations_coupon_code
  on public.registrations(coupon_code)
  where coupon_code is not null
    and status <> 'cancelled';

create schema if not exists private;

create or replace function private.enforce_coupon_redemption_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  coupon_limit integer;
  redemption_count bigint;
begin
  if new.coupon_code is null or new.status = 'cancelled' then
    return new;
  end if;

  select coupon.max_redemptions
    into coupon_limit
    from public.event_coupon_codes as coupon
    where coupon.code = new.coupon_code
    for update;

  if not found then
    raise exception using
      errcode = '23514',
      constraint = 'registrations_coupon_redemption_limit',
      message = 'Coupon code is invalid';
  end if;

  if tg_op = 'UPDATE' then
    select count(*)
      into redemption_count
      from public.registrations as registration
      where registration.coupon_code = new.coupon_code
        and registration.status <> 'cancelled'
        and registration.id <> old.id;
  else
    select count(*)
      into redemption_count
      from public.registrations as registration
      where registration.coupon_code = new.coupon_code
        and registration.status <> 'cancelled';
  end if;

  if redemption_count >= coupon_limit then
    raise exception using
      errcode = '23514',
      constraint = 'registrations_coupon_redemption_limit',
      message = 'This coupon has reached its redemption limit';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_coupon_redemption_limit() from public;

drop trigger if exists registrations_enforce_coupon_redemption_limit
  on public.registrations;

create trigger registrations_enforce_coupon_redemption_limit
before insert or update of coupon_code, status
on public.registrations
for each row
execute function private.enforce_coupon_redemption_limit();
