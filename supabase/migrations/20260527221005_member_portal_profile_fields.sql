alter table public.member_profiles
  add column if not exists rider_type text,
  add column if not exists rider_level text,
  add column if not exists home_mountain text not null default '',
  add column if not exists bio text not null default '',
  add column if not exists carpool_interest boolean not null default false,
  add column if not exists lodging_interest boolean not null default false,
  add column if not exists preferred_language text not null default 'zh',
  add column if not exists instagram text not null default '',
  add column if not exists discord text not null default '',
  add column if not exists avatar_url text not null default '',
  add column if not exists passes text[] not null default '{}',
  add column if not exists equipment jsonb not null default '{"ownsSkis":false,"ownsSnowboard":false,"ownsBoots":false,"needsRentalHelp":false}',
  add column if not exists saved_event_slugs text[] not null default '{}',
  add column if not exists notification_preferences jsonb not null default '{"eventReminders":true,"newTrips":true,"recapPosted":true,"communityUpdates":false}';

alter table public.member_profiles
  drop constraint if exists member_profiles_rider_type_check,
  drop constraint if exists member_profiles_rider_level_structured_check,
  drop constraint if exists member_profiles_preferred_language_check;

alter table public.member_profiles
  add constraint member_profiles_rider_type_check
    check (rider_type is null or rider_type in ('', 'skier', 'snowboarder', 'both', 'learning')),
  add constraint member_profiles_rider_level_structured_check
    check (rider_level is null or rider_level in ('', 'first_timer', 'beginner', 'intermediate', 'advanced', 'expert')),
  add constraint member_profiles_preferred_language_check
    check (preferred_language in ('en', 'zh'));

create index if not exists idx_member_profiles_saved_event_slugs
  on public.member_profiles using gin (saved_event_slugs);
