-- Membership is activated only after the authenticated user has accepted the
-- current required privacy policy. Auth identities may exist without a member
-- profile while email verification or consent is pending.

drop trigger if exists create_member_profile_after_signup on auth.users;
drop function if exists private.create_member_profile_for_new_user();

create table if not exists public.member_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_type text not null,
  policy_version text not null,
  accepted boolean not null,
  accepted_at timestamptz,
  locale text not null default 'en',
  acceptance_source text not null,
  created_at timestamptz not null default now(),
  constraint member_consents_type_check
    check (consent_type in ('privacy_policy', 'event_media_social')),
  constraint member_consents_locale_check
    check (locale in ('en', 'zh')),
  constraint member_consents_accepted_at_check
    check ((accepted and accepted_at is not null) or (not accepted and accepted_at is null)),
  constraint member_consents_user_type_version_key
    unique (user_id, consent_type, policy_version)
);

create index if not exists idx_member_consents_current_lookup
  on public.member_consents (user_id, consent_type, policy_version, accepted);

alter table public.member_consents enable row level security;

drop policy if exists "Members can read own consents" on public.member_consents;
create policy "Members can read own consents"
  on public.member_consents
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Members can insert own consents" on public.member_consents;
create policy "Members can insert own consents"
  on public.member_consents
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Members can update own consents" on public.member_consents;
create policy "Members can update own consents"
  on public.member_consents
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.member_consents from anon;
grant select, insert, update on table public.member_consents to authenticated;
grant all on table public.member_consents to service_role;

-- Preserve the explicit acceptances captured by the immediately preceding
-- profile-column implementation. Rows without an acceptance timestamp are not
-- treated as consent to the current policy.
insert into public.member_consents (
  user_id,
  consent_type,
  policy_version,
  accepted,
  accepted_at,
  locale,
  acceptance_source
)
select
  user_id,
  'privacy_policy',
  '2026-08-04',
  true,
  privacy_policy_accepted_at,
  coalesce(nullif(preferred_language, ''), 'en'),
  'legacy_profile'
from public.member_profiles
where privacy_policy_accepted_at is not null
on conflict (user_id, consent_type, policy_version) do nothing;

insert into public.member_consents (
  user_id,
  consent_type,
  policy_version,
  accepted,
  accepted_at,
  locale,
  acceptance_source
)
select
  user_id,
  'event_media_social',
  '2026-08-04',
  true,
  privacy_policy_accepted_at,
  coalesce(nullif(preferred_language, ''), 'en'),
  'legacy_profile'
from public.member_profiles
where privacy_policy_accepted_at is not null
  and photo_social_media_consent = true
on conflict (user_id, consent_type, policy_version) do nothing;
