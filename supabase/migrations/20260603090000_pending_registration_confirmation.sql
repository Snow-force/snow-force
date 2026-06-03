-- Require email-link confirmation before registrations enter the confirmed registration table.

create table if not exists public.pending_registrations (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null references public.events(slug) on delete cascade,
  member_id uuid references public.member_profiles(id),
  answers jsonb not null default '{}',
  consent_given boolean not null default false,
  contact_email text not null,
  contact_name text not null,
  contact_phone text,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pending_registrations_event_email
  on public.pending_registrations(event_slug, lower(contact_email), expires_at desc);

create index if not exists idx_pending_registrations_expires
  on public.pending_registrations(expires_at);

alter table public.pending_registrations enable row level security;

create policy "Staff can read pending registrations" on public.pending_registrations
  for select using (public.is_staff());
create policy "Staff can insert pending registrations" on public.pending_registrations
  for insert with check (public.is_staff());
create policy "Staff can update pending registrations" on public.pending_registrations
  for update using (public.is_staff()) with check (public.is_staff());
create policy "Staff can delete pending registrations" on public.pending_registrations
  for delete using (public.is_staff());

drop index if exists public.registrations_one_active_email_per_event;

create unique index if not exists registrations_one_email_per_event
  on public.registrations(event_slug, lower(contact_email));
