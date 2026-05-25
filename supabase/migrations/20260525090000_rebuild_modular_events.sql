-- Rebuild SnowForce activity schema for modular event creation.
-- This migration is destructive by design because the project has no historical event data.

drop table if exists registrations cascade;
drop table if exists event_registration_questions cascade;
drop table if exists event_detail_modules cascade;
drop table if exists events cascade;

create table events (
  slug text primary key,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  registration_state text not null default 'closed' check (registration_state in ('open', 'closed', 'full')),
  title_zh text not null default '',
  title_en text not null default '',
  event_date date,
  meet_time time,
  meet_location_zh text not null default '',
  meet_location_en text not null default '',
  activity_location_zh text not null default '',
  activity_location_en text not null default '',
  location_url text not null default '',
  cover_image text not null default '',
  capacity integer not null default 0 check (capacity >= 0),
  registration_close_at timestamptz,
  requires_approval boolean not null default false,
  allow_waitlist boolean not null default false,
  allow_cancellation boolean not null default true,
  fee_amount text not null default '',
  payment_instructions_zh text not null default '',
  payment_instructions_en text not null default '',
  seo_title_zh text not null default '',
  seo_title_en text not null default '',
  seo_description_zh text not null default '',
  seo_description_en text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table event_registration_questions (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null references events(slug) on delete cascade,
  question_key text not null,
  type text not null check (type in ('text', 'single_choice', 'multiple_choice', 'yes_no', 'date', 'phone')),
  required boolean not null default false,
  sort_order integer not null default 0,
  label_zh text not null default '',
  label_en text not null default '',
  help_zh text not null default '',
  help_en text not null default '',
  options_zh jsonb not null default '[]',
  options_en jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_slug, question_key)
);

create table event_detail_modules (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null references events(slug) on delete cascade,
  module_type text not null check (module_type in ('intro', 'highlights', 'itinerary', 'notes', 'fees', 'refund', 'contact', 'custom')),
  display_mode text not null default 'rich_text' check (display_mode in ('rich_text', 'list')),
  sort_order integer not null default 0,
  title_zh text not null default '',
  title_en text not null default '',
  content_zh text not null default '',
  content_en text not null default '',
  items_zh jsonb not null default '[]',
  items_en jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table registrations (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null references events(slug) on delete cascade,
  member_id uuid references member_profiles(id),
  answers jsonb not null default '{}',
  consent_given boolean not null default false,
  contact_email text not null,
  contact_name text not null,
  contact_phone text,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'waitlist')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_event_registration_questions_event on event_registration_questions(event_slug, sort_order);
create index idx_event_detail_modules_event on event_detail_modules(event_slug, sort_order);
create index idx_registrations_event on registrations(event_slug);
create index idx_registrations_member on registrations(member_id);
create index idx_registrations_status on registrations(status);

alter table events enable row level security;
alter table event_registration_questions enable row level security;
alter table event_detail_modules enable row level security;
alter table registrations enable row level security;

create policy "Public can read published events" on events
  for select using (status = 'published');

create policy "Public can read published event questions" on event_registration_questions
  for select using (exists (
    select 1 from events where events.slug = event_registration_questions.event_slug and events.status = 'published'
  ));

create policy "Public can read published event modules" on event_detail_modules
  for select using (exists (
    select 1 from events where events.slug = event_detail_modules.event_slug and events.status = 'published'
  ));

create policy "Members can read own registrations" on registrations
  for select using (member_id in (select id from member_profiles where user_id = auth.uid()));

create policy "Staff can manage events" on events
  for all using (public.is_staff());
create policy "Staff can manage event questions" on event_registration_questions
  for all using (public.is_staff());
create policy "Staff can manage event modules" on event_detail_modules
  for all using (public.is_staff());
create policy "Staff can manage registrations" on registrations
  for all using (public.is_staff());

create trigger set_updated_at before update on events for each row execute function update_updated_at();
create trigger set_updated_at before update on event_registration_questions for each row execute function update_updated_at();
create trigger set_updated_at before update on event_detail_modules for each row execute function update_updated_at();
create trigger set_updated_at before update on registrations for each row execute function update_updated_at();
