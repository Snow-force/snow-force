-- Supporting tables for SnowForce member portal:
-- member_passes, member_equipment, saved_events, notifications

create table if not exists public.member_passes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.member_profiles(id) on delete cascade,
  pass_type text not null check (pass_type in ('ikon', 'epic', 'big_bear', 'mountain_high', 'other')),
  label text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.member_equipment (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.member_profiles(id) on delete cascade unique,
  owns_skis boolean not null default false,
  owns_snowboard boolean not null default false,
  owns_boots boolean not null default false,
  needs_rental_help boolean not null default false,
  note text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.member_profiles(id) on delete cascade,
  event_slug text not null references public.events(slug) on delete cascade,
  saved_at timestamptz not null default now(),
  unique(profile_id, event_slug)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.member_profiles(id) on delete cascade,
  type text not null check (type in (
    'email_verification',
    'profile_completion',
    'event_opened',
    'waitlist_confirmed',
    'event_cancelled',
    'recap_published',
    'registration_changed',
    'payment_reminder'
  )),
  title text not null,
  body text not null default '',
  href text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_member_passes_profile on public.member_passes(profile_id);
create index if not exists idx_saved_events_profile on public.saved_events(profile_id);
create index if not exists idx_saved_events_event on public.saved_events(event_slug);
create index if not exists idx_notifications_profile_read on public.notifications(profile_id, read_at nulls first);

-- RLS
alter table public.member_passes enable row level security;
alter table public.member_equipment enable row level security;
alter table public.saved_events enable row level security;
alter table public.notifications enable row level security;

-- Members can read/write own passes
create policy "Members can read own passes" on public.member_passes
  for select using (profile_id in (
    select id from public.member_profiles where user_id = (select auth.uid())
  ));

create policy "Members can insert own passes" on public.member_passes
  for insert with check (profile_id in (
    select id from public.member_profiles where user_id = (select auth.uid())
  ));

create policy "Members can delete own passes" on public.member_passes
  for delete using (profile_id in (
    select id from public.member_profiles where user_id = (select auth.uid())
  ));

-- Members can read/write own equipment
create policy "Members can read own equipment" on public.member_equipment
  for select using (profile_id in (
    select id from public.member_profiles where user_id = (select auth.uid())
  ));

create policy "Members can insert own equipment" on public.member_equipment
  for insert with check (profile_id in (
    select id from public.member_profiles where user_id = (select auth.uid())
  ));

create policy "Members can update own equipment" on public.member_equipment
  for update using (profile_id in (
    select id from public.member_profiles where user_id = (select auth.uid())
  ));

-- Members can read/write own saved events
create policy "Members can read own saved events" on public.saved_events
  for select using (profile_id in (
    select id from public.member_profiles where user_id = (select auth.uid())
  ));

create policy "Members can insert own saved events" on public.saved_events
  for insert with check (profile_id in (
    select id from public.member_profiles where user_id = (select auth.uid())
  ));

create policy "Members can delete own saved events" on public.saved_events
  for delete using (profile_id in (
    select id from public.member_profiles where user_id = (select auth.uid())
  ));

-- Members can read own notifications, update read_at only
create policy "Members can read own notifications" on public.notifications
  for select using (profile_id in (
    select id from public.member_profiles where user_id = (select auth.uid())
  ));

create policy "Members can mark own notifications read" on public.notifications
  for update using (profile_id in (
    select id from public.member_profiles where user_id = (select auth.uid())
  ))
  with check (profile_id in (
    select id from public.member_profiles where user_id = (select auth.uid())
  ));

-- Staff can read all
create policy "Staff can read passes" on public.member_passes
  for select using (public.is_staff());
create policy "Staff can read equipment" on public.member_equipment
  for select using (public.is_staff());
create policy "Staff can read saved events" on public.saved_events
  for select using (public.is_staff());
create policy "Staff can read notifications" on public.notifications
  for select using (public.is_staff());
