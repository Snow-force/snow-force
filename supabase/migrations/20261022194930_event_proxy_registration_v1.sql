-- V1: one attendee / one payment. Existing events remain opted out.
begin;

-- Production still had the obsolete coupon index at the rollout baseline.
-- Never silently publish multi-use coupon UI against single-use SQL semantics.
do $$ begin
  if to_regclass('public.registrations_coupon_code_used_once') is not null or not exists (
    select 1 from pg_trigger where tgrelid = 'public.registrations'::regclass
      and tgname = 'registrations_enforce_coupon_redemption_limit' and not tgisinternal
  ) then
    raise exception 'Apply 20260823071209_allow_configurable_coupon_redemptions before event proxy registration';
  end if;
end $$;

alter table public.events
  add column allow_proxy_registrations boolean not null default false,
  add column max_proxy_registrations integer not null default 5
    check (max_proxy_registrations between 1 and 20);

-- The aggregate RPC explicitly lists columns; carry the rollout settings through
-- the existing transactional editor save instead of a second independent write.
create or replace function public.save_event_aggregate(
  p_core jsonb, p_questions jsonb, p_modules jsonb, p_merchant_booth_program jsonb, p_review_config jsonb
) returns public.events language plpgsql security invoker set search_path = '' as $$
declare saved public.events;
begin
  saved := public.save_event_aggregate(p_core,p_questions,p_modules,p_merchant_booth_program);
  update public.events set review_config = coalesce(p_review_config,'{}'::jsonb),
    allow_proxy_registrations = coalesce((p_core->>'allow_proxy_registrations')::boolean,false),
    max_proxy_registrations = coalesce((p_core->>'max_proxy_registrations')::integer,5)
    where slug = saved.slug returning * into saved;
  return saved;
end;
$$;
revoke all on function public.save_event_aggregate(jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_event_aggregate(jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;

alter table public.registrations
  add column booker_member_id uuid references public.member_profiles(id),
  add column registration_kind text not null default 'self' check (registration_kind in ('self', 'proxy')),
  add column attendee_email text,
  add column attendee_confirmation_status text not null default 'not_required'
    check (attendee_confirmation_status in ('not_required', 'pending', 'accepted', 'declined')),
  add column client_request_key text unique,
  add column pending_registration_id uuid references public.pending_registrations(id),
  add column creation_source text not null default 'legacy' check (creation_source in ('member','admin','legacy'));

update public.registrations set booker_member_id = member_id, attendee_email = contact_email;
alter table public.registrations add constraint proxy_attendee_identity check (
  registration_kind <> 'proxy' or (booker_member_id is not null and member_id is null
    and attendee_confirmation_status <> 'not_required')
);
create unique index registrations_pending_once on public.registrations(pending_registration_id)
  where pending_registration_id is not null;
create index registrations_booker_event on public.registrations(booker_member_id, event_slug);
drop index if exists public.registrations_one_email_per_event;
drop index if exists public.registrations_one_member_per_event;
create unique index if not exists registrations_one_active_member_per_event
  on public.registrations(event_slug, member_id) where member_id is not null and status <> 'cancelled';

alter table public.pending_registrations
  add column preferred_language text not null default 'en' check (preferred_language in ('en','zh')),
  add column registration_kind text not null default 'self' check (registration_kind in ('self', 'proxy')),
  add column participant_key text not null default 'self',
  add column attendee_email text,
  add column hold_expires_at timestamptz not null default (now() + interval '30 minutes'),
  add column fulfillment_state text not null default 'pending'
    check (fulfillment_state in ('pending', 'paid_requires_review'));

-- Backfill from the original creation time: migration must not revive months-old
-- abandoned forms or unexpectedly consume all remaining places.
update public.pending_registrations set hold_expires_at = least(expires_at, created_at + interval '30 minutes')
  where checkout_attempt is null and fulfilled_registration_id is null;

drop index if exists public.pending_registrations_one_member_per_event;
create unique index pending_registrations_participant_once
  on public.pending_registrations(event_slug, member_id, participant_key)
  where member_id is not null and fulfilled_registration_id is null;
alter table public.pending_registrations add constraint pending_participant_identity check (
  (registration_kind = 'self' and participant_key = 'self') or
  (registration_kind = 'proxy' and member_id is not null and participant_key ~ '^[a-f0-9-]{36}$')
);

create or replace function private.protect_pending_checkout()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.checkout_attempt is not null or old.fulfilled_registration_id is not null then
    if tg_op = 'DELETE' then raise exception 'Paid or in-progress checkout records must be retained'; end if;
    if (to_jsonb(new) - 'checkout_attempt' - 'fulfilled_registration_id' - 'fulfillment_state' - 'hold_expires_at')
       is distinct from (to_jsonb(old) - 'checkout_attempt' - 'fulfilled_registration_id' - 'fulfillment_state' - 'hold_expires_at') then
      raise exception 'Checkout registration details are locked';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.protect_pending_checkout() from public, anon, authenticated;

-- A common event lock covers every writer: free, coupon, paid, staff and reactivation.
-- A checkout attempt holds inventory until Stripe authoritatively expires it.
create or replace function private.guard_event_registration_inventory()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  event_row public.events;
  occupied integer;
  proxy_count integer;
  payer uuid;
  excluded_pending uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('event-registration:' || new.event_slug, 0));
  select * into event_row from public.events where slug = new.event_slug for update;
  if not found then raise exception 'registration_event_missing'; end if;

  if tg_table_name = 'registrations' then
    if new.status = 'cancelled' then return new; end if;
    if tg_op = 'UPDATE' and old.status <> 'cancelled' then return new; end if;
    excluded_pending := new.pending_registration_id;
    payer := new.booker_member_id;
    if excluded_pending is not null and not exists (
      select 1 from public.pending_registrations p where p.id = excluded_pending
        and p.event_slug = new.event_slug and p.member_id = coalesce(new.booker_member_id, new.member_id)
        and p.registration_kind = new.registration_kind
        and p.contact_name = new.contact_name and p.contact_email = new.contact_email
        and coalesce(p.contact_phone,'') = coalesce(new.contact_phone,'')
        and p.answers = new.answers and p.consent_given = new.consent_given
        and (p.attendee_email is not distinct from new.attendee_email or
          (p.registration_kind = 'self' and p.attendee_email is null and new.attendee_email = p.contact_email))
    ) then raise exception 'registration_pending_identity_mismatch'; end if;
  else
    if new.fulfilled_registration_id is not null then return new; end if;
    if tg_op = 'UPDATE' and (old.checkout_attempt is not null or old.fulfilled_registration_id is not null) then
      return new;
    end if;
    if new.checkout_attempt is null and new.hold_expires_at <= clock_timestamp() then return new; end if;
    excluded_pending := new.id;
    payer := new.member_id;
    if event_row.status <> 'published' or event_row.registration_state <> 'open'
       or (event_row.registration_close_at is not null and event_row.registration_close_at <= clock_timestamp()) then
      raise exception 'registration_event_closed';
    end if;
    if tg_op = 'INSERT' and new.registration_kind = 'proxy' and not event_row.allow_proxy_registrations then
      raise exception 'proxy_registration_disabled';
    end if;
  end if;

  select count(*) into occupied from public.registrations r
    where r.event_slug = new.event_slug and r.status <> 'cancelled'
      and (tg_table_name <> 'registrations' or r.id <> new.id);
  occupied := occupied + (select count(*) from public.pending_registrations p
    where p.event_slug = new.event_slug and p.fulfilled_registration_id is null
      and p.id is distinct from excluded_pending
      and (p.hold_expires_at > clock_timestamp() or p.checkout_attempt is not null)
      and not exists (select 1 from public.registrations r where r.pending_registration_id = p.id));
  if event_row.capacity > 0 and occupied >= event_row.capacity then raise exception 'registration_capacity_exceeded'; end if;

  if new.registration_kind = 'proxy' then
    select count(*) into proxy_count from public.registrations r
      where r.event_slug = new.event_slug and r.booker_member_id = payer
        and r.registration_kind = 'proxy' and r.status <> 'cancelled'
        and (tg_table_name <> 'registrations' or r.id <> new.id);
    proxy_count := proxy_count + (select count(*) from public.pending_registrations p
      where p.event_slug = new.event_slug and p.member_id = payer and p.registration_kind = 'proxy'
        and p.id is distinct from excluded_pending and p.fulfilled_registration_id is null
        and (p.hold_expires_at > clock_timestamp() or p.checkout_attempt is not null)
        and not exists (select 1 from public.registrations r where r.pending_registration_id = p.id));
    if proxy_count >= event_row.max_proxy_registrations then raise exception 'proxy_registration_limit'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_event_registration_inventory() from public, anon, authenticated;
create trigger guard_registration_inventory before insert or update of status on public.registrations
  for each row execute function private.guard_event_registration_inventory();
create trigger guard_pending_inventory before insert or update on public.pending_registrations
  for each row execute function private.guard_event_registration_inventory();

-- Only server reconciliation may invoke this after verifying Stripe's expired status.
create or replace function public.release_registration_checkout_hold(pending_id_input uuid, attempt_id_input text, session_id_input text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare changed uuid;
begin
  update public.pending_registrations set checkout_attempt = null, hold_expires_at = least(hold_expires_at, clock_timestamp())
    where id = pending_id_input and fulfilled_registration_id is null
      and checkout_attempt->>'id' = attempt_id_input
      and (checkout_attempt->>'sessionId' is null or checkout_attempt->>'sessionId' = session_id_input)
    returning id into changed;
  return changed is not null;
end;
$$;
revoke all on function public.release_registration_checkout_hold(uuid,text,text) from public, anon, authenticated;
grant execute on function public.release_registration_checkout_hold(uuid,text,text) to service_role;

-- Booker access never comes from email matching or user-editable auth metadata.
create policy "Bookers can read their registrations" on public.registrations
  for select to authenticated using (
    booker_member_id in (select id from public.member_profiles where user_id = (select auth.uid()))
  );

create table public.registration_guest_invitations (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  status text not null default 'issued' check (status in ('issued', 'accepted', 'declined', 'revoked')),
  waiver_text text,
  waiver_sha text,
  signer_role text check (signer_role in ('attendee', 'guardian')),
  signer_name text,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index registration_guest_invitation_active on public.registration_guest_invitations(registration_id)
  where status = 'issued';
alter table public.registration_guest_invitations enable row level security;
revoke all on public.registration_guest_invitations from public, anon, authenticated;
grant select, insert, update on public.registration_guest_invitations to service_role;

create table public.registration_audit_events (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id),
  actor_id text not null,
  action text not null,
  created_at timestamptz not null default now()
);
alter table public.registration_audit_events enable row level security;
revoke all on public.registration_audit_events from public, anon, authenticated;
grant select, insert on public.registration_audit_events to service_role;
create index registration_audit_registration on public.registration_audit_events(registration_id, created_at);

create or replace function public.issue_registration_guest_invitation(
  registration_id_input uuid, token_hash_input text, expires_at_input timestamptz, actor_id_input text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare r public.registrations; invitation_id uuid; waiver_text_value text; waiver_sha_value text;
begin
  select * into r from public.registrations where id = registration_id_input for update;
  if not found or r.registration_kind <> 'proxy' or r.status <> 'confirmed'
    or r.attendee_confirmation_status = 'accepted' then raise exception 'invitation_unavailable'; end if;
  select p.waiver_text_en, p.waiver_text_sha into waiver_text_value, waiver_sha_value
    from public.pending_registrations p where p.id = r.pending_registration_id;
  update public.registration_guest_invitations set status = 'revoked'
    where registration_id = r.id and status = 'issued';
  insert into public.registration_guest_invitations(registration_id, token_hash, expires_at, waiver_text, waiver_sha)
    values(r.id, token_hash_input, greatest(expires_at_input,
      (select (event_date + interval '7 days')::timestamptz from public.events where slug = r.event_slug)),
      waiver_text_value, waiver_sha_value) returning id into invitation_id;
  update public.registrations set attendee_confirmation_status = 'pending' where id = r.id;
  insert into public.registration_audit_events(registration_id, actor_id, action)
    values(r.id, actor_id_input, 'invitation_issued');
  return invitation_id;
end;
$$;
revoke all on function public.issue_registration_guest_invitation(uuid,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.issue_registration_guest_invitation(uuid,text,timestamptz,text) to service_role;

create or replace function public.respond_registration_guest_invitation(
  token_hash_input text, accepted_input boolean, typed_name_input text, signer_role_input text
) returns void language plpgsql security invoker set search_path = '' as $$
declare invitation public.registration_guest_invitations; r public.registrations;
begin
  select * into invitation from public.registration_guest_invitations where token_hash = token_hash_input;
  if not found then raise exception 'invitation_unavailable'; end if;
  select * into r from public.registrations where id = invitation.registration_id for update;
  select * into invitation from public.registration_guest_invitations where id = invitation.id for update;
  if invitation.status <> 'issued' or invitation.expires_at <= clock_timestamp() or r.status <> 'confirmed' then
    raise exception 'invitation_unavailable';
  end if;
  if accepted_input then
    if length(trim(typed_name_input)) not between 2 and 200 or signer_role_input not in ('attendee', 'guardian') then
      raise exception 'attendee_signature_required';
    end if;
    if invitation.waiver_text is not null then
      insert into public.waiver_acceptances(registration_id,legal_text_snapshot,waiver_text_sha,typed_name,accepted_at)
        values(r.id,invitation.waiver_text,invitation.waiver_sha,trim(typed_name_input),clock_timestamp());
    end if;
  end if;
  update public.registration_guest_invitations set status = case when accepted_input then 'accepted' else 'declined' end,
    signer_role = case when accepted_input then signer_role_input else null end, responded_at = clock_timestamp()
    ,signer_name = case when accepted_input then trim(typed_name_input) else null end
    where id = invitation.id;
  update public.registrations set attendee_confirmation_status = case when accepted_input then 'accepted' else 'declined' end
    where id = r.id;
  insert into public.registration_audit_events(registration_id,actor_id,action)
    values(r.id,'invitation:' || invitation.id,case when accepted_input then 'attendee_accepted' else 'attendee_declined' end);
end;
$$;
revoke all on function public.respond_registration_guest_invitation(text,boolean,text,text) from public, anon, authenticated;
grant execute on function public.respond_registration_guest_invitation(text,boolean,text,text) to service_role;

create or replace function public.revoke_registration_guest_invitation(registration_id_input uuid, actor_id_input text)
returns void language plpgsql security invoker set search_path = '' as $$
declare ticket uuid;
begin
  select id into ticket from public.registrations where id = registration_id_input and registration_kind = 'proxy' for update;
  if not found then raise exception 'invitation_unavailable'; end if;
  update public.registration_guest_invitations set status = 'revoked' where registration_id = ticket and status = 'issued';
  insert into public.registration_audit_events(registration_id,actor_id,action) values(ticket,actor_id_input,'invitation_revoked');
end;
$$;
revoke all on function public.revoke_registration_guest_invitation(uuid,text) from public,anon,authenticated;
grant execute on function public.revoke_registration_guest_invitation(uuid,text) to service_role;

create or replace function private.protect_proxy_registration()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.registration_kind = 'proxy' and
    (new.member_id,new.booker_member_id,new.registration_kind,new.contact_name,new.contact_email,new.contact_phone,new.attendee_email,new.answers,new.pending_registration_id)
    is distinct from
    (old.member_id,old.booker_member_id,old.registration_kind,old.contact_name,old.contact_email,old.contact_phone,old.attendee_email,old.answers,old.pending_registration_id) then
    raise exception 'proxy_attendee_identity_locked';
  end if;
  if new.registration_kind = 'proxy' and new.attendance_status = 'attended' and
    (new.status <> 'confirmed' or new.attendee_confirmation_status <> 'accepted') then
    raise exception 'attendee_authorization_required';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_proxy_registration() from public, anon, authenticated;
create trigger protect_proxy_registration before insert or update on public.registrations
  for each row execute function private.protect_proxy_registration();

create or replace function public.checkin_registration_guest(registration_id_input uuid, actor_id_input text)
returns void language plpgsql security invoker set search_path = '' as $$
declare r public.registrations;
begin
  select * into r from public.registrations where id = registration_id_input for update;
  if not found or r.registration_kind <> 'proxy' or r.status <> 'confirmed'
    or r.attendee_confirmation_status <> 'accepted' then raise exception 'attendee_authorization_required'; end if;
  if r.attendance_status = 'attended' then return; end if;
  update public.registrations set attendance_status = 'attended', attendance_source = 'admin',
    attendance_marked_at = clock_timestamp() where id = r.id;
  insert into public.registration_audit_events(registration_id,actor_id,action) values(r.id,actor_id_input,'guest_checkin');
end;
$$;
revoke all on function public.checkin_registration_guest(uuid,text) from public, anon, authenticated;
grant execute on function public.checkin_registration_guest(uuid,text) to service_role;

commit;
