-- Re-drop the broad public SELECT policy on storage.objects for the recap-media bucket.
--
-- The earlier hardening migration (20260527024705_database_hardening.sql) included this drop,
-- but on the live production project the drop did not take effect while every later statement
-- did commit, leaving the policy in place. The Supabase advisor (public_bucket_allows_listing)
-- still flags it. This migration re-runs the single drop and nothing else, so the listing
-- exposure is closed without disturbing the rest of the hardened schema.
--
-- Why this is safe:
--   - The recap-media bucket is `public: true`, so anonymous reads via public object URLs
--     (https://<project>.supabase.co/storage/v1/object/public/recap-media/...) are served
--     by the storage CDN without going through RLS — no SELECT policy needed for that path.
--   - All admin uploads, deletes, and any future `.list()` calls in app code use the
--     service-role client (createAdminClient) which bypasses RLS entirely.
--   - After this drop, anonymous `.list()` on the bucket returns empty/forbidden, which is
--     the explicit goal: stop clients from enumerating every uploaded recap photo.

drop policy if exists "Public recap media is readable" on storage.objects;