create table public.merchant_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  business_name text not null check (btrim(business_name) <> ''),
  contact_name text not null check (btrim(contact_name) <> ''),
  contact_email text not null check (btrim(contact_email) <> ''),
  contact_phone text not null default '',
  category text not null check (btrim(category) <> ''),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.merchant_booth_programs (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null unique references public.events(slug) on delete cascade,
  enabled boolean not null default false,
  payment_instructions_en text not null default '',
  payment_instructions_zh text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, event_slug)
);

create table public.merchant_booth_plans (
  id uuid primary key default gen_random_uuid(),
  booth_program_id uuid not null references public.merchant_booth_programs(id) on delete cascade,
  name_en text not null check (btrim(name_en) <> ''),
  name_zh text not null check (btrim(name_zh) <> ''),
  description_en text not null default '',
  description_zh text not null default '',
  price_amount numeric(12, 2) not null check (price_amount > 0),
  price_currency text not null check (price_currency in ('usd', 'cny', 'eur', 'gbp', 'jpy')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, booth_program_id)
);

create table public.merchant_physical_booths (
  id uuid primary key default gen_random_uuid(),
  booth_program_id uuid not null references public.merchant_booth_programs(id) on delete cascade,
  booth_plan_id uuid not null,
  booth_code text not null check (btrim(booth_code) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booth_program_id, booth_code),
  unique (id, booth_plan_id),
  foreign key (booth_plan_id, booth_program_id)
    references public.merchant_booth_plans(id, booth_program_id)
    on delete restrict
);

create table public.merchant_booth_applications (
  id uuid primary key default gen_random_uuid(),
  merchant_profile_id uuid not null references public.merchant_profiles(id) on delete cascade,
  event_slug text not null references public.events(slug) on delete cascade,
  booth_program_id uuid not null,
  requested_plan_id uuid not null,
  business_name text not null check (btrim(business_name) <> ''),
  contact_name text not null check (btrim(contact_name) <> ''),
  contact_email text not null check (btrim(contact_email) <> ''),
  contact_phone text not null default '',
  category text not null check (btrim(category) <> ''),
  description text not null default '',
  status text not null default 'submitted' check (
    status in ('submitted', 'under_review', 'approved', 'payment_pending', 'paid', 'rejected', 'withdrawn')
  ),
  quoted_amount numeric(12, 2) not null check (quoted_amount > 0),
  quoted_currency text not null check (quoted_currency in ('usd', 'cny', 'eur', 'gbp', 'jpy')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_profile_id, event_slug),
  unique (id, requested_plan_id),
  foreign key (booth_program_id, event_slug)
    references public.merchant_booth_programs(id, event_slug)
    on delete restrict,
  foreign key (requested_plan_id, booth_program_id)
    references public.merchant_booth_plans(id, booth_program_id)
    on delete restrict
);

create table public.merchant_booth_allocations (
  id uuid primary key default gen_random_uuid(),
  merchant_application_id uuid not null unique references public.merchant_booth_applications(id) on delete cascade,
  booth_id uuid not null unique references public.merchant_physical_booths(id) on delete restrict,
  booth_plan_id uuid not null,
  allocated_by_user_id uuid references auth.users(id) on delete set null,
  allocated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (merchant_application_id, booth_plan_id)
    references public.merchant_booth_applications(id, requested_plan_id)
    on delete restrict,
  foreign key (booth_id, booth_plan_id)
    references public.merchant_physical_booths(id, booth_plan_id)
    on delete restrict
);

create table public.merchant_manual_payments (
  id uuid primary key default gen_random_uuid(),
  merchant_application_id uuid not null unique references public.merchant_booth_applications(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency in ('usd', 'cny', 'eur', 'gbp', 'jpy')),
  method text not null check (btrim(method) <> ''),
  reference text not null check (btrim(reference) <> ''),
  note text not null default '',
  paid_at timestamptz not null,
  recorded_by_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'confirmed' check (status = 'confirmed'),
  created_at timestamptz not null default now()
);

create index idx_merchant_booth_applications_owner_lookup
  on public.merchant_booth_applications(merchant_profile_id, created_at desc);

create index idx_merchant_booth_allocations_application_lookup
  on public.merchant_booth_allocations(merchant_application_id);

create index idx_merchant_manual_payments_application_lookup
  on public.merchant_manual_payments(merchant_application_id);

alter table public.merchant_profiles enable row level security;
alter table public.merchant_booth_programs enable row level security;
alter table public.merchant_booth_plans enable row level security;
alter table public.merchant_physical_booths enable row level security;
alter table public.merchant_booth_applications enable row level security;
alter table public.merchant_booth_allocations enable row level security;
alter table public.merchant_manual_payments enable row level security;

create policy "Merchant owners can read own profile"
  on public.merchant_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Merchant owners can read own applications"
  on public.merchant_booth_applications
  for select to authenticated
  using (
    exists (
      select 1
      from public.merchant_profiles
      where merchant_profiles.id = merchant_booth_applications.merchant_profile_id
        and merchant_profiles.user_id = (select auth.uid())
    )
  );

create policy "Merchant owners can read own booth allocations"
  on public.merchant_booth_allocations
  for select to authenticated
  using (
    exists (
      select 1
      from public.merchant_booth_applications
      join public.merchant_profiles
        on merchant_profiles.id = merchant_booth_applications.merchant_profile_id
      where merchant_booth_applications.id = merchant_booth_allocations.merchant_application_id
        and merchant_profiles.user_id = (select auth.uid())
    )
  );

create policy "Merchant owners can read own manual payments"
  on public.merchant_manual_payments
  for select to authenticated
  using (
    exists (
      select 1
      from public.merchant_booth_applications
      join public.merchant_profiles
        on merchant_profiles.id = merchant_booth_applications.merchant_profile_id
      where merchant_booth_applications.id = merchant_manual_payments.merchant_application_id
        and merchant_profiles.user_id = (select auth.uid())
    )
  );

create policy "Service role manages merchant profiles"
  on public.merchant_profiles
  for all to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

create policy "Service role manages merchant booth programs"
  on public.merchant_booth_programs
  for all to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

create policy "Service role manages merchant booth plans"
  on public.merchant_booth_plans
  for all to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

create policy "Service role manages physical merchant booths"
  on public.merchant_physical_booths
  for all to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

create policy "Service role manages merchant booth applications"
  on public.merchant_booth_applications
  for all to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

create policy "Service role manages merchant booth allocations"
  on public.merchant_booth_allocations
  for all to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

create policy "Service role manages merchant manual payments"
  on public.merchant_manual_payments
  for all to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

revoke all on public.merchant_profiles from anon, authenticated;
revoke all on public.merchant_booth_programs from anon, authenticated;
revoke all on public.merchant_booth_plans from anon, authenticated;
revoke all on public.merchant_physical_booths from anon, authenticated;
revoke all on public.merchant_booth_applications from anon, authenticated;
revoke all on public.merchant_booth_allocations from anon, authenticated;
revoke all on public.merchant_manual_payments from anon, authenticated;

grant select on public.merchant_profiles to authenticated;
grant select on public.merchant_booth_applications to authenticated;
grant select on public.merchant_booth_allocations to authenticated;
grant select on public.merchant_manual_payments to authenticated;

grant all on public.merchant_profiles to service_role;
grant all on public.merchant_booth_programs to service_role;
grant all on public.merchant_booth_plans to service_role;
grant all on public.merchant_physical_booths to service_role;
grant all on public.merchant_booth_applications to service_role;
grant all on public.merchant_booth_allocations to service_role;
grant all on public.merchant_manual_payments to service_role;
