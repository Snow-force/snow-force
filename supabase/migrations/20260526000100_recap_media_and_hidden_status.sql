-- Allow recap status hidden: unlisted but reachable by direct URL. Insert recap-media bucket.
alter table public.event_recaps
  drop constraint if exists event_recaps_status_check;

alter table public.event_recaps
  add constraint event_recaps_status_check
  check (status in ('draft', 'published', 'hidden'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recap-media',
  'recap-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public recap media is readable"
  on storage.objects
  for select
  using (bucket_id = 'recap-media');
