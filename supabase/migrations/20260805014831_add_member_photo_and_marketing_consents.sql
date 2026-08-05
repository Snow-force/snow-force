alter table public.member_profiles
  add column if not exists photo_social_media_consent boolean not null default true,
  add column if not exists marketing_email_opt_in boolean not null default true,
  add column if not exists privacy_policy_accepted_at timestamptz;

create or replace function private.create_member_profile_for_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.member_profiles (
    user_id,
    display_name,
    email,
    photo_social_media_consent,
    marketing_email_opt_in,
    privacy_policy_accepted_at
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    coalesce(new.email, ''),
    case when new.raw_user_meta_data ->> 'photo_social_media_consent' = 'false' then false else true end,
    case when new.raw_user_meta_data ->> 'marketing_email_opt_in' = 'false' then false else true end,
    case when new.raw_user_meta_data ->> 'privacy_policy_accepted' = 'true' then now() else null end
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;
