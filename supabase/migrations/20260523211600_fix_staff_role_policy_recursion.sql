-- Avoid recursive RLS checks on staff_roles by resolving staff status through
-- a security definer helper that runs outside caller RLS.

create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.staff_roles
    where user_id = auth.uid()
  );
$$;

drop policy if exists "Staff can manage events" on events;
drop policy if exists "Staff can manage registrations" on registrations;
drop policy if exists "Staff can manage recaps" on event_recaps;
drop policy if exists "Staff can manage faqs" on faq_items;
drop policy if exists "Staff can manage inquiries" on partner_inquiries;
drop policy if exists "Staff can manage media" on media_assets;
drop policy if exists "Staff can view roles" on staff_roles;

create policy "Staff can manage events" on events for all using (public.is_staff());
create policy "Staff can manage registrations" on registrations for all using (public.is_staff());
create policy "Staff can manage recaps" on event_recaps for all using (public.is_staff());
create policy "Staff can manage faqs" on faq_items for all using (public.is_staff());
create policy "Staff can manage inquiries" on partner_inquiries for all using (public.is_staff());
create policy "Staff can manage media" on media_assets for all using (public.is_staff());
create policy "Staff can view roles" on staff_roles for select using (public.is_staff());
