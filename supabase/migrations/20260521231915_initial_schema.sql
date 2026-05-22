-- SnowForce Activity Platform initial schema
-- Run this via Supabase CLI or SQL editor to set up the database.

-- Events
create table if not exists events (
  slug text primary key,
  status text not null default 'draft' check (status in ('draft', 'published')),
  registration_state text not null default 'closed' check (registration_state in ('open', 'closed', 'full')),
  title_en text not null,
  title_zh text not null,
  subtitle_en text,
  subtitle_zh text,
  description_en text,
  description_zh text,
  highlights_en jsonb default '[]',
  highlights_zh jsonb default '[]',
  audience_level_en text,
  audience_level_zh text,
  schedule_en text,
  schedule_zh text,
  location_en text,
  location_zh text,
  location_url text,
  fee_info_en text,
  fee_info_zh text,
  notices_en jsonb default '[]',
  notices_zh jsonb default '[]',
  cover_image text,
  media jsonb default '[]',
  capacity integer not null default 0,
  registration_open_at timestamptz,
  registration_close_at timestamptz,
  event_start_at timestamptz,
  event_end_at timestamptz,
  registration_fields jsonb default '[]',
  tags_en jsonb default '[]',
  tags_zh jsonb default '[]',
  seo_title_en text,
  seo_title_zh text,
  seo_description_en text,
  seo_description_zh text,
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
create index if not exists idx_registrations_event on registrations(event_slug);
create index if not exists idx_registrations_member on registrations(member_id);
create index if not exists idx_registrations_status on registrations(status);

-- Row-level security
alter table events enable row level security;
alter table member_profiles enable row level security;
alter table registrations enable row level security;
alter table event_recaps enable row level security;
alter table faq_items enable row level security;
alter table partner_inquiries enable row level security;
alter table media_assets enable row level security;
alter table staff_roles enable row level security;

-- Public read policies
create policy "Public can read published events" on events for select using (status = 'published');
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
create trigger set_updated_at before update on member_profiles for each row execute function update_updated_at();
create trigger set_updated_at before update on registrations for each row execute function update_updated_at();
create trigger set_updated_at before update on event_recaps for each row execute function update_updated_at();
create trigger set_updated_at before update on faq_items for each row execute function update_updated_at();
