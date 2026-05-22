create schema if not exists private;

revoke all on schema private from public;

update public.member_profiles
set email = auth.users.email
from auth.users
where public.member_profiles.user_id = auth.users.id
  and public.member_profiles.email = ''
  and auth.users.email is not null;

drop trigger if exists create_member_profile_after_signup on auth.users;
drop function if exists public.create_member_profile_for_new_user();

create or replace function private.create_member_profile_for_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.member_profiles (user_id, display_name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    coalesce(new.email, '')
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger create_member_profile_after_signup
  after insert on auth.users
  for each row execute function private.create_member_profile_for_new_user();
