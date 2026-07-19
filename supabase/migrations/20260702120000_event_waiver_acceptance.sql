-- Event waiver acceptance: adds per-event liability waiver fields and an immutable acceptance audit table.
-- When events.waiver_text_en IS NULL, registration proceeds with the existing consent checkbox (back-compat).

-- 1. Add waiver columns to events table
alter table public.events
  add column if not exists waiver_text_en text,
  add column if not exists waiver_text_sha text;

-- 2. Create waiver_acceptances table
create table public.waiver_acceptances (
  id                bigserial primary key,
  registration_id   uuid not null references public.registrations(id) on delete cascade,
  legal_text_snapshot text not null,
  waiver_text_sha   text not null,
  typed_name        text not null,
  accepted_at       timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

comment on table public.waiver_acceptances is 'Immutable audit record of a member accepting a liability waiver at registration time.';
comment on column public.waiver_acceptances.legal_text_snapshot is 'The full waiver text the participant saw and accepted. Frozen at acceptance time.';
comment on column public.waiver_acceptances.waiver_text_sha is 'SHA-256 of legal_text_snapshot, server-computed. Used for integrity verification.';
comment on column public.waiver_acceptances.typed_name is 'The participant typed full name as their electronic signature.';

-- 3. Indexes
create index if not exists idx_waiver_acceptances_registration
  on public.waiver_acceptances(registration_id);

-- 4. RLS policies
alter table public.waiver_acceptances enable row level security;

-- Members can read their own acceptances; staff can read all
drop policy if exists "Members can read own waiver acceptances or staff can read waiver acceptances" on public.waiver_acceptances;
create policy "Members can read own waiver acceptances or staff can read waiver acceptances"
  on public.waiver_acceptances
  for select using (
    public.is_staff()
    or registration_id in (
      select id
      from public.registrations
      where member_id in (
        select id
        from public.member_profiles
        where user_id = (select auth.uid())
      )
    )
  );

-- Staff can insert (service-role bypasses RLS anyway, but policy needed for defense-in-depth)
drop policy if exists "Staff can insert waiver acceptances" on public.waiver_acceptances;
create policy "Staff can insert waiver acceptances"
  on public.waiver_acceptances
  for insert with check (public.is_staff());

-- Staff can update (append-only enforced at app layer, not DB trigger)
drop policy if exists "Staff can update waiver acceptances" on public.waiver_acceptances;
create policy "Staff can update waiver acceptances"
  on public.waiver_acceptances
  for update using (public.is_staff()) with check (public.is_staff());

-- Staff can delete (for admin cleanup)
drop policy if exists "Staff can delete waiver acceptances" on public.waiver_acceptances;
create policy "Staff can delete waiver acceptances"
  on public.waiver_acceptances
  for delete using (public.is_staff());

-- 5. Add waiver snapshot columns to pending_registrations
alter table public.pending_registrations
  add column if not exists waiver_text_en text,
  add column if not exists waiver_text_sha text,
  add column if not exists typed_name text;
