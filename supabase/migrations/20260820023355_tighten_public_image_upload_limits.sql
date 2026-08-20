-- Keep public image uploads small enough for predictable cached egress.
-- Existing objects remain readable; this limit applies to new and replaced objects.
update storage.buckets
set
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id in ('event-covers', 'recap-media');

do $$
begin
  if (
    select count(*)
    from storage.buckets
    where id in ('event-covers', 'recap-media')
      and file_size_limit = 2097152
      and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  ) <> 2 then
    raise exception 'Public image bucket upload policy was not applied to both buckets';
  end if;
end
$$;
