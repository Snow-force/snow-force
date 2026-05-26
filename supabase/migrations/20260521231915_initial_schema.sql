-- SnowForce Activity Platform initial schema
-- Run this via Supabase CLI or SQL editor to set up the database.

-- Events
create table if not exists events (
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

create table if not exists event_registration_questions (
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

create table if not exists event_detail_modules (
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

-- Member profiles (linked to Supabase Auth users)
create table if not exists member_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  phone text,
  rider_level_en text,
  rider_level_zh text,
  emergency_contact text,
  emergency_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

-- Registrations
create table if not exists registrations (
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

-- Event recaps
create table if not exists event_recaps (
  slug text primary key,
  status text not null default 'draft' check (status in ('draft', 'published')),
  title_en text not null,
  title_zh text not null,
  summary_en text,
  summary_zh text,
  content_en text,
  content_zh text,
  date date not null,
  location_en text,
  location_zh text,
  cover_image text,
  media jsonb default '[]',
  tags_en jsonb default '[]',
  tags_zh jsonb default '[]',
  seo_title_en text,
  seo_title_zh text,
  seo_description_en text,
  seo_description_zh text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- FAQ items
create table if not exists faq_items (
  id uuid primary key default gen_random_uuid(),
  question_en text not null,
  question_zh text not null,
  answer_en text not null,
  answer_zh text not null,
  category_en text not null default 'General',
  category_zh text not null default '一般问题',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Partner inquiries
create table if not exists partner_inquiries (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  inquiry_type text default 'Partnership',
  message text not null,
  status text not null default 'new' check (status in ('new', 'contacted', 'archived')),
  created_at timestamptz not null default now()
);

-- Media assets
create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  path text not null,
  alt_text_en text,
  alt_text_zh text,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);

-- Staff roles
create table if not exists staff_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'manager')),
  created_at timestamptz not null default now(),
  primary key (user_id)
);

-- Indexes
create index if not exists idx_event_registration_questions_event on event_registration_questions(event_slug, sort_order);
create index if not exists idx_event_detail_modules_event on event_detail_modules(event_slug, sort_order);
create index if not exists idx_registrations_event on registrations(event_slug);
create index if not exists idx_registrations_member on registrations(member_id);
create index if not exists idx_registrations_status on registrations(status);

-- Row-level security
alter table events enable row level security;
alter table event_registration_questions enable row level security;
alter table event_detail_modules enable row level security;
alter table member_profiles enable row level security;
alter table registrations enable row level security;
alter table event_recaps enable row level security;
alter table faq_items enable row level security;
alter table partner_inquiries enable row level security;
alter table media_assets enable row level security;
alter table staff_roles enable row level security;

-- Public read policies
create policy "Public can read published events" on events for select using (status = 'published');
create policy "Public can read published event questions" on event_registration_questions
  for select using (exists (
    select 1 from events where events.slug = event_registration_questions.event_slug and events.status = 'published'
  ));
create policy "Public can read published event modules" on event_detail_modules
  for select using (exists (
    select 1 from events where events.slug = event_detail_modules.event_slug and events.status = 'published'
  ));
create policy "Public can read published recaps" on event_recaps for select using (status = 'published');
create policy "Public can read faqs" on faq_items for select using (true);

-- Member policies
create policy "Members can read own profile" on member_profiles for select using (auth.uid() = user_id);
create policy "Members can update own profile" on member_profiles for update using (auth.uid() = user_id);
create policy "Members can insert own profile" on member_profiles for insert with check (auth.uid() = user_id);
create policy "Members can read own registrations" on registrations for select using (member_id in (select id from member_profiles where user_id = auth.uid()));

-- Registrations and inquiries are written by server-side application commands.
-- Do not grant anonymous direct inserts here: registration availability,
-- configurable form validation, and spam controls live in those commands.

-- Staff policies (all-access for users in staff_roles)
create policy "Staff can manage events" on events for all using (exists (select 1 from staff_roles where user_id = auth.uid()));
create policy "Staff can manage event questions" on event_registration_questions for all using (exists (select 1 from staff_roles where user_id = auth.uid()));
create policy "Staff can manage event modules" on event_detail_modules for all using (exists (select 1 from staff_roles where user_id = auth.uid()));
create policy "Staff can manage registrations" on registrations for all using (exists (select 1 from staff_roles where user_id = auth.uid()));
create policy "Staff can manage recaps" on event_recaps for all using (exists (select 1 from staff_roles where user_id = auth.uid()));
create policy "Staff can manage faqs" on faq_items for all using (exists (select 1 from staff_roles where user_id = auth.uid()));
create policy "Staff can manage inquiries" on partner_inquiries for all using (exists (select 1 from staff_roles where user_id = auth.uid()));
create policy "Staff can manage media" on media_assets for all using (exists (select 1 from staff_roles where user_id = auth.uid()));
create policy "Staff can view roles" on staff_roles for select using (exists (select 1 from staff_roles where user_id = auth.uid()));

-- Trigger to update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on events for each row execute function update_updated_at();
create trigger set_updated_at before update on event_registration_questions for each row execute function update_updated_at();
create trigger set_updated_at before update on event_detail_modules for each row execute function update_updated_at();
create trigger set_updated_at before update on member_profiles for each row execute function update_updated_at();
create trigger set_updated_at before update on registrations for each row execute function update_updated_at();
create trigger set_updated_at before update on event_recaps for each row execute function update_updated_at();
create trigger set_updated_at before update on faq_items for each row execute function update_updated_at();
