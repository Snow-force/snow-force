alter table public.events
  add column if not exists review_config jsonb not null default '{}'::jsonb;

alter table public.registrations
  add column if not exists attendance_status text not null default 'unmarked',
  add column if not exists attendance_source text,
  add column if not exists attendance_marked_at timestamptz;

alter table public.registrations
  drop constraint if exists registrations_attendance_status_check,
  add constraint registrations_attendance_status_check
    check (attendance_status in ('unmarked', 'attended', 'no_show')),
  drop constraint if exists registrations_attendance_source_check,
  add constraint registrations_attendance_source_check
    check (attendance_source is null or attendance_source in ('checkin_qr', 'admin'));

create table if not exists public.event_qr_campaigns (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null references public.events(slug) on delete cascade,
  purpose text not null check (purpose in ('checkin', 'review')),
  access_code text not null unique,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  opened_at timestamptz,
  closes_at timestamptz,
  closed_at timestamptz,
  review_config_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_slug, purpose),
  check (
    (purpose = 'review' and review_config_snapshot is not null)
    or (purpose = 'checkin' and review_config_snapshot is null)
  )
);

create table if not exists public.event_qr_accesses (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.event_qr_campaigns(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  access_expires_at timestamptz,
  result text not null default 'accepted' check (result in ('accepted', 'rejected')),
  unique (campaign_id, registration_id)
);

create table if not exists public.event_reviews (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade unique,
  campaign_id uuid not null references public.event_qr_campaigns(id) on delete restrict,
  overall_rating smallint not null check (overall_rating between 1 and 5),
  answers jsonb not null default '{}'::jsonb,
  consent_to_publish boolean not null default false,
  submission_language text not null check (submission_language in ('en', 'zh')),
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'rejected')),
  moderation_note text not null default '',
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_registrations_event_attendance
  on public.registrations(event_slug, attendance_status);
create index if not exists idx_event_qr_campaigns_event_status
  on public.event_qr_campaigns(event_slug, purpose, status);
create index if not exists idx_event_qr_accesses_registration
  on public.event_qr_accesses(registration_id, scanned_at desc);
create index if not exists idx_event_reviews_campaign_status
  on public.event_reviews(campaign_id, moderation_status, created_at desc);

alter table public.event_qr_campaigns enable row level security;
alter table public.event_qr_accesses enable row level security;
alter table public.event_reviews enable row level security;

revoke all on public.event_qr_campaigns from anon, authenticated;
revoke all on public.event_qr_accesses from anon, authenticated;
revoke all on public.event_reviews from anon, authenticated;

grant all on public.event_qr_campaigns to service_role;
grant all on public.event_qr_accesses to service_role;
grant all on public.event_reviews to service_role;

drop trigger if exists set_updated_at on public.event_qr_campaigns;
create trigger set_updated_at
before update on public.event_qr_campaigns
for each row execute function public.update_updated_at();

drop trigger if exists set_updated_at on public.event_reviews;
create trigger set_updated_at
before update on public.event_reviews
for each row execute function public.update_updated_at();

create or replace function public.save_event_aggregate(
  p_core jsonb,
  p_questions jsonb,
  p_modules jsonb,
  p_merchant_booth_program jsonb,
  p_review_config jsonb
)
returns public.events
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_event public.events%rowtype;
begin
  v_event := public.save_event_aggregate(
    p_core,
    p_questions,
    p_modules,
    p_merchant_booth_program
  );

  update public.events
  set review_config = coalesce(p_review_config, '{}'::jsonb)
  where slug = v_event.slug
  returning * into v_event;

  return v_event;
end;
$$;

revoke all on function public.save_event_aggregate(jsonb, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_event_aggregate(jsonb, jsonb, jsonb, jsonb, jsonb)
  to service_role;

create or replace function public.open_event_qr_campaign(
  p_event_slug text,
  p_purpose text,
  p_access_code text,
  p_closes_at timestamptz,
  p_review_config_snapshot jsonb
)
returns public.event_qr_campaigns
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_campaign public.event_qr_campaigns%rowtype;
begin
  if p_purpose not in ('checkin', 'review') then
    raise exception 'Invalid QR campaign purpose';
  end if;

  if p_purpose = 'review' and p_review_config_snapshot is null then
    raise exception 'Review campaign requires a configuration snapshot';
  end if;

  if p_purpose = 'checkin' and p_review_config_snapshot is not null then
    raise exception 'Check-in campaign cannot have a review configuration snapshot';
  end if;

  if p_purpose = 'review' then
    update public.event_qr_campaigns
    set status = 'closed', closed_at = now()
    where event_slug = p_event_slug
      and purpose = 'checkin'
      and status = 'open';
  end if;

  insert into public.event_qr_campaigns (
    event_slug,
    purpose,
    access_code,
    status,
    opened_at,
    closes_at,
    closed_at,
    review_config_snapshot
  )
  values (
    p_event_slug,
    p_purpose,
    p_access_code,
    'open',
    now(),
    p_closes_at,
    null,
    case when p_purpose = 'review' then p_review_config_snapshot else null end
  )
  on conflict (event_slug, purpose) do update
  set access_code = excluded.access_code,
      status = excluded.status,
      opened_at = excluded.opened_at,
      closes_at = excluded.closes_at,
      closed_at = excluded.closed_at,
      review_config_snapshot = excluded.review_config_snapshot
  returning * into v_campaign;

  return v_campaign;
end;
$$;

revoke all on function public.open_event_qr_campaign(text, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.open_event_qr_campaign(text, text, text, timestamptz, jsonb)
  to service_role;
