-- Supabase's default table grants include destructive privileges for the
-- authenticated role. Consent evidence is intentionally append/update only.
revoke all on table public.member_consents from authenticated;
grant select, insert, update on table public.member_consents to authenticated;
