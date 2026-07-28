create table if not exists public.event_coupon_codes (
  code text primary key check (code = upper(trim(code)) and code ~ '^[A-Z0-9_-]{3,32}$'),
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(10, 2) not null check (discount_value > 0),
  active boolean not null default true,
  starts_at timestamptz,
  expires_at timestamptz,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_type <> 'percent' or discount_value <= 100),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);

alter table public.pending_registrations
  add column if not exists coupon_code text;

alter table public.registrations
  add column if not exists coupon_code text,
  add column if not exists discount_amount numeric(10, 2) not null default 0;

create index if not exists idx_registrations_coupon_code
  on public.registrations(coupon_code)
  where coupon_code is not null;

alter table public.event_coupon_codes enable row level security;

create policy "service role manages event coupon codes"
  on public.event_coupon_codes
  for all to service_role
  using (true)
  with check (true);
