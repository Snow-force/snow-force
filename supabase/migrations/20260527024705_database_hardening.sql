-- Tighten public storage reads, recap linkage, registration uniqueness, and RLS policy performance.
-- Deliberately leaves public.is_staff() placement unchanged for the current shared-admin phase.

-- Public buckets already serve public object URLs; these broad SELECT policies also allow object listing.
drop policy if exists "Public event cover reads" on storage.objects;
drop policy if exists "Public recap media is readable" on storage.objects;

-- A recap belongs to at most one event, and an event has at most one recap.
-- Existing event_slug values must refer to real events before this constraint can be added.
alter table public.event_recaps
  add constraint event_recaps_event_slug_fkey
  foreign key (event_slug) references public.events(slug)
  on delete set null;

create unique index if not exists event_recaps_event_slug_unique
  on public.event_recaps(event_slug)
  where event_slug is not null;

-- Prevent duplicate active event registrations while allowing a cancelled registration to be replaced.
create unique index if not exists registrations_one_active_member_per_event
  on public.registrations(event_slug, member_id)
  where member_id is not null and status <> 'cancelled';

create unique index if not exists registrations_one_active_email_per_event
  on public.registrations(event_slug, lower(contact_email))
  where status <> 'cancelled';

-- Replace auth.uid() calls with initplan-friendly (select auth.uid()).
drop policy if exists "Members can read own profile" on public.member_profiles;
drop policy if exists "Members can update own profile" on public.member_profiles;
drop policy if exists "Members can insert own profile" on public.member_profiles;

create policy "Members can read own profile" on public.member_profiles
  for select using ((select auth.uid()) = user_id);

create policy "Members can update own profile" on public.member_profiles
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Members can insert own profile" on public.member_profiles
  for insert with check ((select auth.uid()) = user_id);

-- Collapse overlapping permissive SELECT policies while preserving public reads and staff access.
drop policy if exists "Public can read published events" on public.events;
drop policy if exists "Staff can manage events" on public.events;

create policy "Public can read published events or staff can read events" on public.events
  for select using (status = 'published' or public.is_staff());
create policy "Staff can insert events" on public.events
  for insert with check (public.is_staff());
create policy "Staff can update events" on public.events
  for update using (public.is_staff()) with check (public.is_staff());
create policy "Staff can delete events" on public.events
  for delete using (public.is_staff());

drop policy if exists "Public can read published event questions" on public.event_registration_questions;
drop policy if exists "Staff can manage event questions" on public.event_registration_questions;

create policy "Public can read published event questions or staff can read questions" on public.event_registration_questions
  for select using (
    public.is_staff()
    or exists (
      select 1
      from public.events
      where events.slug = event_registration_questions.event_slug
        and events.status = 'published'
    )
  );
create policy "Staff can insert event questions" on public.event_registration_questions
  for insert with check (public.is_staff());
create policy "Staff can update event questions" on public.event_registration_questions
  for update using (public.is_staff()) with check (public.is_staff());
create policy "Staff can delete event questions" on public.event_registration_questions
  for delete using (public.is_staff());

drop policy if exists "Public can read published event modules" on public.event_detail_modules;
drop policy if exists "Staff can manage event modules" on public.event_detail_modules;

create policy "Public can read published event modules or staff can read modules" on public.event_detail_modules
  for select using (
    public.is_staff()
    or exists (
      select 1
      from public.events
      where events.slug = event_detail_modules.event_slug
        and events.status = 'published'
    )
  );
create policy "Staff can insert event modules" on public.event_detail_modules
  for insert with check (public.is_staff());
create policy "Staff can update event modules" on public.event_detail_modules
  for update using (public.is_staff()) with check (public.is_staff());
create policy "Staff can delete event modules" on public.event_detail_modules
  for delete using (public.is_staff());

drop policy if exists "Public can read published recaps" on public.event_recaps;
drop policy if exists "Staff can manage recaps" on public.event_recaps;

create policy "Public can read published recaps or staff can read recaps" on public.event_recaps
  for select using (status = 'published' or public.is_staff());
create policy "Staff can insert recaps" on public.event_recaps
  for insert with check (public.is_staff());
create policy "Staff can update recaps" on public.event_recaps
  for update using (public.is_staff()) with check (public.is_staff());
create policy "Staff can delete recaps" on public.event_recaps
  for delete using (public.is_staff());

drop policy if exists "Public can read faqs" on public.faq_items;
drop policy if exists "Staff can manage faqs" on public.faq_items;

create policy "Public can read faqs" on public.faq_items
  for select using (true);
create policy "Staff can insert faqs" on public.faq_items
  for insert with check (public.is_staff());
create policy "Staff can update faqs" on public.faq_items
  for update using (public.is_staff()) with check (public.is_staff());
create policy "Staff can delete faqs" on public.faq_items
  for delete using (public.is_staff());

drop policy if exists "Members can read own registrations" on public.registrations;
drop policy if exists "Staff can manage registrations" on public.registrations;

create policy "Members can read own registrations or staff can read registrations" on public.registrations
  for select using (
    public.is_staff()
    or member_id in (
      select id
      from public.member_profiles
      where user_id = (select auth.uid())
    )
  );
create policy "Staff can insert registrations" on public.registrations
  for insert with check (public.is_staff());
create policy "Staff can update registrations" on public.registrations
  for update using (public.is_staff()) with check (public.is_staff());
create policy "Staff can delete registrations" on public.registrations
  for delete using (public.is_staff());

-- Common list/admin query indexes. Keep existing single-column indexes until real traffic confirms they are redundant.
create index if not exists idx_events_status_event_date
  on public.events(status, event_date desc);

create index if not exists idx_event_recaps_status_date
  on public.event_recaps(status, date desc);

create index if not exists idx_faq_items_sort_order
  on public.faq_items(sort_order);

create index if not exists idx_partner_inquiries_status_created
  on public.partner_inquiries(status, created_at desc);

create index if not exists idx_registrations_event_status_created
  on public.registrations(event_slug, status, created_at desc);
