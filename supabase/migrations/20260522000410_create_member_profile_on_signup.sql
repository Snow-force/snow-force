alter table public.member_profiles
  add column if not exists email text not null default '';

create unique index if not exists idx_member_profiles_email
  on public.member_profiles (lower(email));

create or replace function public.create_member_profile_for_new_user()
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

drop trigger if exists create_member_profile_after_signup on auth.users;

create trigger create_member_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_member_profile_for_new_user();
