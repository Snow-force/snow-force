-- Expand only. V1 stays live; no event is enrolled by this migration.
begin;
alter table public.events add column enable_group_form boolean not null default false,
  add column require_emailed_waiver boolean not null default false;

create table public.event_waiver_policies (
  event_slug text primary key references public.events(slug), event_date date not null,
  time_zone text not null, version uuid not null default gen_random_uuid(),
  adult_text text not null check(length(adult_text) between 100 and 100000),
  guardian_text text not null check(length(guardian_text) between 100 and 100000),
  adult_sha text not null, guardian_sha text not null,
  approved_at timestamptz not null, approved_by text not null
);
create table public.event_bookings (
  id uuid primary key default gen_random_uuid(), event_slug text not null references public.events(slug),
  booker_member_id uuid not null references public.member_profiles(id), request_key uuid not null,
  request_hash text not null, preferred_language text not null check(preferred_language in ('en','zh')),
  created_at timestamptz not null default now(), unique(event_slug,booker_member_id,request_key)
);
create table public.event_waiver_participants (
  id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.event_bookings(id),
  participant_key uuid not null, registration_kind text not null check(registration_kind in ('self','proxy')),
  attendee_name text not null, date_of_birth date not null, event_date date not null,
  signer_role text not null check(signer_role in ('attendee','guardian')), recipient_email text not null,
  guardian_name text, guardian_relationship text, identity_fingerprint text not null,
  policy_version uuid not null, waiver_text text not null, waiver_sha text not null,
  payment_model text not null, requires_approval boolean not null,
  review_required boolean not null default false,
  quoted_amount numeric not null check(quoted_amount>=0), payment_currency text not null,
  unique(booking_id,participant_key)
);
alter table public.pending_registrations add column booking_id uuid references public.event_bookings(id),
  add column waiver_participant_id uuid unique references public.event_waiver_participants(id), add column superseded_at timestamptz;
drop index public.pending_registrations_participant_once;
create unique index pending_registrations_participant_once on public.pending_registrations(event_slug,member_id,participant_key)
  where member_id is not null and fulfilled_registration_id is null and superseded_at is null;
alter table public.registrations add column booking_id uuid references public.event_bookings(id),
  add column waiver_participant_id uuid unique references public.event_waiver_participants(id);

create table public.event_waiver_assignments (
  id uuid primary key default gen_random_uuid(), registration_id uuid not null references public.registrations(id),
  participant_id uuid not null references public.event_waiver_participants(id), is_current boolean not null default true,
  recipient_email text not null, guardian_name text, policy_version uuid not null, waiver_text text not null, waiver_sha text not null,
  generation integer not null default 0, token_hash text unique, expires_at timestamptz,
  status text not null default 'not_sent' check(status in ('not_sent','queued','sent','delivered','bounced','expired','signed','declined','invalidated','needs_review')),
  last_queued_at timestamptz, sends_today integer not null default 0, sends_day date,
  email_verified_at timestamptz, created_at timestamptz not null default now()
);
create unique index event_waiver_assignment_current on public.event_waiver_assignments(registration_id) where is_current;
create table public.event_waiver_signatures (
  id uuid primary key default gen_random_uuid(), assignment_id uuid not null unique references public.event_waiver_assignments(id),
  registration_id uuid not null references public.registrations(id), signer_role text not null,
  signer_name text not null, verified_email text not null, guardian_relationship text,
  policy_version uuid not null, legal_text_snapshot text not null, waiver_sha text not null,
  email_verified_at timestamptz not null, signed_at timestamptz not null default now(),
  ip_digest text, user_agent_digest text
);
create table public.event_waiver_challenges (
  assignment_id uuid primary key references public.event_waiver_assignments(id), generation integer not null,
  code_hash text not null, expires_at timestamptz not null, attempts integer not null default 0,
  sent_at timestamptz not null default now(), sends integer not null default 1,
  proof_hash text, proof_expires_at timestamptz, verified_at timestamptz, consumed_at timestamptz
);
create table public.event_waiver_email_outbox (
  id uuid primary key default gen_random_uuid(), assignment_id uuid not null references public.event_waiver_assignments(id),
  generation integer not null, kind text not null check(kind in ('invitation','verification','reminder','signed','declined')),
  recipient_email text not null, encrypted_payload text, idempotency_key text not null unique,
  status text not null default 'queued' check(status in ('queued','sending','sent','delivered','failed','bounced','complained','cancelled')),
  attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
  lease_id uuid, lease_expires_at timestamptz, provider_message_id text unique, error_code text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index event_waiver_outbox_ready on public.event_waiver_email_outbox(next_attempt_at) where status in ('queued','sending');
create table public.event_waiver_delivery_events (
  event_id text primary key, provider_message_id text not null, event_type text not null, created_at timestamptz not null default now()
);
create table public.event_attendee_claims (
  event_slug text not null references public.events(slug), member_id uuid not null references public.member_profiles(id),
  registration_id uuid not null unique references public.registrations(id), primary key(event_slug,member_id)
);

-- All sensitive reads go through authenticated server commands with explicit ownership checks.
do $$ declare t text; begin
  foreach t in array array['event_waiver_policies','event_bookings','event_waiver_participants','event_waiver_assignments',
    'event_waiver_signatures','event_waiver_challenges','event_waiver_email_outbox','event_waiver_delivery_events','event_attendee_claims'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
  end loop;
end $$;

-- Exclude past events before batching, so old invitations cannot starve future reminders.
create view public.event_waiver_due_reminders with (security_invoker=true) as
  select a.id from public.event_waiver_assignments a
  join public.event_waiver_participants p on p.id=a.participant_id
  join public.event_bookings b on b.id=p.booking_id
  join public.event_waiver_policies policy on policy.event_slug=b.event_slug
  where a.is_current and a.status in('sent','delivered') and a.last_queued_at<statement_timestamp()-interval '1 day'
    and a.expires_at>statement_timestamp() and p.event_date>=(statement_timestamp() at time zone policy.time_zone)::date;
revoke all on public.event_waiver_due_reminders from public,anon,authenticated;
grant select on public.event_waiver_due_reminders to service_role;

create function public.create_event_booking_v2(event_slug_input text, booker_id_input uuid, contact_email_input text,
  request_key_input uuid, request_hash_input text, language_input text, participants_input jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare e public.events; policy public.event_waiver_policies; booking public.event_bookings; p jsonb;
  participant uuid; role_required text; birthday date; self_count integer:=0; proxy_count integer:=0; identity_seen text[]:='{}'; candidate_duplicate boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('event-registration:'||event_slug_input,0));
  select * into booking from public.event_bookings where event_slug=event_slug_input and booker_member_id=booker_id_input and request_key=request_key_input;
  if found then
    if booking.request_hash<>request_hash_input then raise exception 'booking_request_locked'; end if;
    return booking.id;
  end if;
  select * into e from public.events where slug=event_slug_input for update;
  if not found or not e.enable_group_form or not e.require_emailed_waiver or e.status<>'published' or e.registration_state<>'open'
    or (e.registration_close_at is not null and e.registration_close_at<=clock_timestamp()) then raise exception 'group_registration_unavailable'; end if;
  select * into policy from public.event_waiver_policies where event_slug=e.slug and event_date=e.event_date;
  if not found or jsonb_typeof(participants_input)<>'array' or jsonb_array_length(participants_input) not between 1 and e.max_proxy_registrations+1
    or contact_email_input!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'booking_details_invalid'; end if;
  insert into public.event_bookings(event_slug,booker_member_id,request_key,request_hash,preferred_language)
    values(e.slug,booker_id_input,request_key_input,request_hash_input,language_input) returning * into booking;
  for p in select value from jsonb_array_elements(participants_input) loop
    birthday:=(p->>'dateOfBirth')::date;
    if birthday>e.event_date or birthday<e.event_date-interval '120 years' then raise exception 'participant_birth_date_invalid'; end if;
    role_required:=case when extract(year from e.event_date)-extract(year from birthday)-(to_char(e.event_date,'MM-DD')<to_char(birthday,'MM-DD'))::integer>=18 then 'attendee' else 'guardian' end;
    if p->>'kind'='self' then self_count:=self_count+1;
      if exists(select 1 from public.registrations where event_slug=e.slug and member_id=booker_id_input and status<>'cancelled')
        or exists(select 1 from public.event_attendee_claims where event_slug=e.slug and member_id=booker_id_input) then raise exception 'participant_already_registered'; end if;
    elsif p->>'kind'='proxy' then proxy_count:=proxy_count+1;
    else raise exception 'participant_kind_invalid'; end if;
    if self_count>1 or proxy_count>e.max_proxy_registrations or (proxy_count>0 and not e.allow_proxy_registrations)
      or p->>'recipientEmail'!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or (role_required='guardian' and (coalesce(length(p->>'guardianName'),0) not between 2 and 200 or coalesce(p->>'guardianRelationship','') not in ('parent','legal_guardian')))
      or (role_required='attendee' and p->>'kind'='proxy' and lower(p->>'recipientEmail')=lower(contact_email_input)) then raise exception 'participant_details_invalid'; end if;
    candidate_duplicate:=p->>'identityFingerprint'=any(identity_seen);
    identity_seen:=array_append(identity_seen,p->>'identityFingerprint');
    if p->>'kind'='self' then update public.pending_registrations set superseded_at=clock_timestamp(),expires_at=clock_timestamp()-interval '1 second',hold_expires_at=clock_timestamp()-interval '1 second'
      where member_id=booker_id_input and event_slug=e.slug and participant_key='self' and fulfilled_registration_id is null and checkout_attempt is null
        and superseded_at is null and (expires_at<=clock_timestamp() or hold_expires_at<=clock_timestamp()); end if;
    insert into public.event_waiver_participants(booking_id,participant_key,registration_kind,attendee_name,date_of_birth,event_date,
      signer_role,recipient_email,guardian_name,guardian_relationship,identity_fingerprint,policy_version,waiver_text,waiver_sha,payment_model,requires_approval,quoted_amount,payment_currency,review_required)
      values(booking.id,(p->>'key')::uuid,p->>'kind',p->>'name',birthday,e.event_date,role_required,lower(p->>'recipientEmail'),
        p->>'guardianName',p->>'guardianRelationship',p->>'identityFingerprint',policy.version,
        case when role_required='guardian' then policy.guardian_text else policy.adult_text end,
        case when role_required='guardian' then policy.guardian_sha else policy.adult_sha end,e.payment_model,e.requires_approval,
        coalesce((p->>'quotedAmount')::numeric,case when e.payment_model='free' then 0 when e.payment_model='deposit' then e.deposit_amount else e.full_payment_amount end),e.deposit_currency,
        candidate_duplicate or exists(select 1 from public.event_waiver_participants previous join public.event_bookings pb on pb.id=previous.booking_id where pb.event_slug=e.slug and previous.identity_fingerprint=p->>'identityFingerprint'
          and (exists(select 1 from public.registrations r where r.waiver_participant_id=previous.id and r.status<>'cancelled')
            or exists(select 1 from public.pending_registrations h where h.waiver_participant_id=previous.id and h.fulfilled_registration_id is null and h.superseded_at is null and (h.hold_expires_at>clock_timestamp() or h.checkout_attempt is not null))))) returning id into participant;
    insert into public.pending_registrations(event_slug,member_id,registration_kind,participant_key,attendee_email,answers,consent_given,
      contact_name,contact_email,contact_phone,token_hash,expires_at,hold_expires_at,booking_id,waiver_participant_id,preferred_language,coupon_code)
      values(e.slug,booker_id_input,p->>'kind',case when p->>'kind'='self' then 'self' else p->>'key' end,nullif(p->>'attendeeEmail',''),p->'answers',true,
        p->>'name',lower(contact_email_input),coalesce(p->'answers'->>'phone',''),'member-pending-'||gen_random_uuid(),
        clock_timestamp()+interval '24 hours',clock_timestamp()+interval '30 minutes',booking.id,participant,language_input,nullif(p->>'couponCode',''));
  end loop;
  return booking.id;
end $$;

create function private.guard_v2_pending() returns trigger language plpgsql security invoker set search_path='' as $$
declare p public.event_waiver_participants; b public.event_bookings;
begin
  if new.waiver_participant_id is null then
    if tg_op='INSERT' and (select require_emailed_waiver from public.events where slug=new.event_slug) then raise exception 'use_group_registration_v2'; end if;
    return new;
  end if;
  select * into p from public.event_waiver_participants where id=new.waiver_participant_id;
  select * into b from public.event_bookings where id=p.booking_id;
  if p.id is null or new.booking_id is distinct from b.id or new.member_id is distinct from b.booker_member_id or new.event_slug<>b.event_slug
    or new.contact_name<>p.attendee_name or new.registration_kind<>p.registration_kind or new.typed_name is not null then raise exception 'booking_identity_mismatch'; end if;
  return new;
end $$;
create trigger guard_v2_pending before insert or update on public.pending_registrations for each row execute function private.guard_v2_pending();

create function private.guard_v2_registration() returns trigger language plpgsql security invoker set search_path='' as $$
declare p public.pending_registrations; participant public.event_waiver_participants; a public.event_waiver_assignments;
begin
  if tg_op='INSERT' and new.pending_registration_id is not null then
    select * into p from public.pending_registrations where id=new.pending_registration_id;
    new.booking_id:=p.booking_id; new.waiver_participant_id:=p.waiver_participant_id;
  end if;
  if new.member_id is not null and new.status<>'cancelled' and exists(select 1 from public.event_attendee_claims where event_slug=new.event_slug and member_id=new.member_id and registration_id<>new.id) then raise exception 'participant_already_registered'; end if;
  if new.waiver_participant_id is null then
    -- V1 holds created before enrollment must still complete through their original flow.
    -- New legacy holds are blocked by guard_v2_pending; ad-hoc manual registrations need V2 details.
    if tg_op='INSERT' and p.id is null and (select require_emailed_waiver from public.events where slug=new.event_slug) then raise exception 'v2_participant_details_required'; end if;
    return new;
  end if;
  select * into participant from public.event_waiver_participants where id=new.waiver_participant_id;
  if tg_op='INSERT' then
    if participant.event_date<>(select event_date from public.events where slug=new.event_slug) then raise exception 'waiver_policy_changed'; end if;
    if participant.requires_approval then new.approval_status:='pending'; end if;
  elsif (new.waiver_participant_id,new.booking_id,new.member_id,new.contact_name,new.contact_email,new.answers,new.pending_registration_id)
    is distinct from (old.waiver_participant_id,old.booking_id,old.member_id,old.contact_name,old.contact_email,old.answers,old.pending_registration_id) then raise exception 'v2_participant_identity_locked'; end if;
  select * into a from public.event_waiver_assignments where registration_id=new.id and is_current;
  if new.attendee_confirmation_status='accepted' and (tg_op='INSERT' or old.attendee_confirmation_status is distinct from 'accepted') and not exists(select 1 from public.event_waiver_signatures where assignment_id=a.id) then raise exception 'verified_waiver_required'; end if;
  if new.attendance_status='attended' and (tg_op='INSERT' or old.attendance_status is distinct from 'attended') and (new.status<>'confirmed' or a.status<>'signed' or a.id is null
    or new.approval_status not in ('not_required','approved') or (participant.payment_model<>'free' and coalesce(new.deposit_status,'pending') not in ('paid','waived'))
    or not exists(select 1 from public.event_waiver_signatures where assignment_id=a.id)) then raise exception 'verified_waiver_required'; end if;
  return new;
end $$;
create trigger z_guard_v2_registration before insert or update on public.registrations for each row execute function private.guard_v2_registration();

create function private.sync_v2_registration() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.waiver_participant_id is not null then
    if tg_op='INSERT' then insert into public.event_waiver_assignments(registration_id,participant_id,recipient_email,guardian_name,policy_version,waiver_text,waiver_sha)
      select new.id,p.id,p.recipient_email,p.guardian_name,policy.version,case when p.signer_role='guardian' then policy.guardian_text else policy.adult_text end,
        case when p.signer_role='guardian' then policy.guardian_sha else policy.adult_sha end
      from public.event_waiver_participants p join public.event_bookings b on b.id=p.booking_id join public.event_waiver_policies policy on policy.event_slug=b.event_slug where p.id=new.waiver_participant_id;
    elsif new.status='cancelled' and old.status<>'cancelled' then
      update public.event_waiver_assignments set status='invalidated',token_hash=null where registration_id=new.id;
      update public.event_waiver_email_outbox set status='cancelled',encrypted_payload=null where assignment_id in(select id from public.event_waiver_assignments where registration_id=new.id) and status in('queued','sending');
    end if;
  end if;
  if new.status='cancelled' then delete from public.event_attendee_claims where registration_id=new.id; end if;
  return new;
end $$;
create trigger sync_v2_registration after insert or update on public.registrations for each row execute function private.sync_v2_registration();

create function public.queue_event_waiver(assignment_id_input uuid, token_hash_input text, payload_input text, actor_input text, kind_input text default 'invitation')
returns void language plpgsql security invoker set search_path='' as $$
declare a public.event_waiver_assignments; p public.event_waiver_participants; r public.registrations;
begin
  select * into a from public.event_waiver_assignments where id=assignment_id_input for update;
  select * into r from public.registrations where id=a.registration_id;
  select * into p from public.event_waiver_participants where id=a.participant_id;
  if kind_input='reminder' and p.event_date<(clock_timestamp() at time zone (select time_zone from public.event_waiver_policies where event_slug=r.event_slug))::date then raise exception 'waiver_reminders_finished'; end if;
  if kind_input not in('invitation','reminder') or a.id is null or not a.is_current or r.status<>'confirmed' or a.status in('signed','declined','invalidated','needs_review') or token_hash_input!~'^[a-f0-9]{64}$'
    or (a.last_queued_at>clock_timestamp()-interval '1 minute') or (a.sends_day=current_date and a.sends_today>=10) then raise exception 'waiver_resend_unavailable'; end if;
  if exists(select 1 from public.event_waiver_email_outbox o join public.event_waiver_assignments old_a on old_a.id=o.assignment_id where old_a.registration_id=r.id and o.kind in('invitation','reminder') and o.created_at>clock_timestamp()-interval '1 minute')
    or (select count(*) from public.event_waiver_email_outbox o join public.event_waiver_assignments old_a on old_a.id=o.assignment_id where old_a.registration_id=r.id and o.kind in('invitation','reminder') and o.created_at>clock_timestamp()-interval '24 hours')>=10 then raise exception 'waiver_resend_limited'; end if;
  update public.event_waiver_email_outbox set status='cancelled',encrypted_payload=null where assignment_id=a.id and status in('queued','sending');
  update public.event_waiver_assignments set generation=generation+1,token_hash=token_hash_input,
    expires_at=greatest(clock_timestamp()+interval '30 days',p.event_date+interval '7 days'),status='queued',last_queued_at=clock_timestamp(),email_verified_at=null,
    sends_today=case when sends_day=current_date then sends_today+1 else 1 end,sends_day=current_date where id=a.id;
  delete from public.event_waiver_challenges where assignment_id=a.id;
  insert into public.event_waiver_email_outbox(assignment_id,generation,kind,recipient_email,encrypted_payload,idempotency_key)
    values(a.id,a.generation+1,kind_input,a.recipient_email,payload_input,'waiver/'||a.id||'/'||(a.generation+1));
  insert into public.registration_audit_events(registration_id,actor_id,action) values(r.id,actor_input,'v2_waiver_queued');
end $$;

create function public.queue_event_waiver_code(token_hash_input text, code_hash_input text, payload_input text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.event_waiver_assignments; c public.event_waiver_challenges; recipient text; seq integer;
begin
  select * into a from public.event_waiver_assignments where token_hash=token_hash_input for update;
  if a.id is null or not a.is_current or a.status not in('queued','sent','delivered') or a.expires_at<=clock_timestamp() then return false; end if;
  select * into c from public.event_waiver_challenges where assignment_id=a.id;
  if c.assignment_id is not null and (c.sent_at>clock_timestamp()-interval '1 minute' or c.sends>=5 or c.attempts>=5 or c.consumed_at is not null) then return false; end if;
  seq:=coalesce(c.sends,0)+1;
  recipient:=a.recipient_email;
  insert into public.event_waiver_challenges(assignment_id,generation,code_hash,expires_at,sends)
    values(a.id,a.generation,code_hash_input,clock_timestamp()+interval '10 minutes',seq)
    on conflict(assignment_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at,sends=excluded.sends,sent_at=clock_timestamp(),proof_hash=null,verified_at=null;
  insert into public.event_waiver_email_outbox(assignment_id,generation,kind,recipient_email,encrypted_payload,idempotency_key)
    values(a.id,a.generation,'verification',recipient,payload_input,'waiver-code/'||a.id||'/'||a.generation||'/'||seq);
  return true;
end $$;

create function public.verify_event_waiver_code(token_hash_input text, code_hash_input text, proof_hash_input text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.event_waiver_assignments; c public.event_waiver_challenges;
begin
  select * into a from public.event_waiver_assignments where token_hash=token_hash_input for update;
  select * into c from public.event_waiver_challenges where assignment_id=a.id for update;
  if a.id is null or not a.is_current or a.status not in('queued','sent','delivered') or a.expires_at<=clock_timestamp() or c.assignment_id is null
    or c.generation<>a.generation or c.expires_at<=clock_timestamp() or c.attempts>=5 or c.consumed_at is not null or c.verified_at is not null then return false; end if;
  update public.event_waiver_challenges set attempts=attempts+1 where assignment_id=a.id;
  if c.code_hash<>code_hash_input then return false; end if;
  update public.event_waiver_challenges set verified_at=clock_timestamp(),proof_hash=proof_hash_input,proof_expires_at=clock_timestamp()+interval '15 minutes' where assignment_id=a.id;
  update public.event_waiver_assignments set email_verified_at=clock_timestamp() where id=a.id;
  return true;
end $$;

create function public.respond_event_waiver(token_hash_input text, proof_hash_input text, accepted_input boolean,
  signer_name_input text, signer_role_input text, guardian_attested_input boolean, member_id_input uuid, ip_digest_input text, ua_digest_input text, receipt_payload_input text)
returns void language plpgsql security invoker set search_path='' as $$
declare a public.event_waiver_assignments; p public.event_waiver_participants; c public.event_waiver_challenges; r public.registrations;
begin
  -- Same event lock as capacity and identity writers; serializes verified member claims.
  select * into a from public.event_waiver_assignments where token_hash=token_hash_input;
  select * into r from public.registrations where id=a.registration_id;
  perform pg_advisory_xact_lock(hashtextextended('event-registration:'||r.event_slug,0));
  select * into a from public.event_waiver_assignments where id=a.id for update;
  select * into r from public.registrations where id=a.registration_id for update;
  select * into p from public.event_waiver_participants where id=a.participant_id;
  select * into c from public.event_waiver_challenges where assignment_id=a.id for update;
  if a.id is null or not a.is_current or a.status not in('queued','sent','delivered') or a.expires_at<=clock_timestamp() or r.status<>'confirmed'
    or c.proof_hash is distinct from proof_hash_input or proof_hash_input is null or c.generation<>a.generation
    or c.verified_at is null or c.proof_expires_at<=clock_timestamp() or c.consumed_at is not null then raise exception 'waiver_verification_required'; end if;
  if signer_role_input is distinct from p.signer_role or (p.signer_role='guardian' and guardian_attested_input is distinct from true) then raise exception 'waiver_signer_invalid'; end if;
  if accepted_input then
    if length(btrim(signer_name_input)) not between 2 and 200 then raise exception 'waiver_signature_required'; end if;
    if p.signer_role='guardian' and lower(btrim(signer_name_input))<>lower(btrim(a.guardian_name)) then raise exception 'guardian_name_mismatch'; end if;
    if p.signer_role='attendee' and lower(btrim(signer_name_input))<>lower(btrim(p.attendee_name)) then raise exception 'attendee_name_mismatch'; end if;
    if member_id_input is not null and p.signer_role='attendee' then
      if exists(select 1 from public.registrations where event_slug=r.event_slug and member_id=member_id_input and status<>'cancelled' and id<>r.id) then raise exception 'participant_already_registered'; end if;
      insert into public.event_attendee_claims(event_slug,member_id,registration_id) values(r.event_slug,member_id_input,r.id);
    end if;
    insert into public.event_waiver_signatures(assignment_id,registration_id,signer_role,signer_name,verified_email,guardian_relationship,
      policy_version,legal_text_snapshot,waiver_sha,email_verified_at,ip_digest,user_agent_digest)
      values(a.id,r.id,p.signer_role,btrim(signer_name_input),a.recipient_email,p.guardian_relationship,a.policy_version,a.waiver_text,a.waiver_sha,c.verified_at,ip_digest_input,ua_digest_input);
  end if;
  update public.event_waiver_challenges set consumed_at=clock_timestamp() where assignment_id=a.id;
  update public.event_waiver_assignments set status=case when not accepted_input then 'declined' when p.signer_role='guardian' or p.review_required then 'needs_review' else 'signed' end where id=a.id;
  insert into public.event_waiver_email_outbox(assignment_id,generation,kind,recipient_email,encrypted_payload,idempotency_key)
    values(a.id,a.generation,case when accepted_input then 'signed' else 'declined' end,a.recipient_email,receipt_payload_input,'waiver-receipt/'||a.id||'/'||a.generation);
  if r.registration_kind='proxy' then update public.registrations set attendee_confirmation_status=case when accepted_input then 'accepted' else 'declined' end where id=r.id; end if;
  insert into public.registration_audit_events(registration_id,actor_id,action) values(r.id,'waiver:'||a.id,case when accepted_input then 'v2_waiver_signed' else 'v2_waiver_declined' end);
end $$;

create function public.claim_event_waiver_email() returns setof public.event_waiver_email_outbox
language plpgsql security invoker set search_path='' as $$
begin
  update public.event_waiver_email_outbox set status='failed',error_code='retry_window_expired',encrypted_payload=null
    where (status='queued' or (status='sending' and lease_expires_at<clock_timestamp()))
      and (created_at<clock_timestamp()-interval '23 hours' or attempts>=5);
  return query update public.event_waiver_email_outbox o set status='sending',lease_id=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '5 minutes',attempts=o.attempts+1,updated_at=clock_timestamp()
    where o.id=(select id from public.event_waiver_email_outbox where (status='queued' or (status='sending' and lease_expires_at<clock_timestamp()))
      and next_attempt_at<=clock_timestamp() order by created_at for update skip locked limit 1) returning o.*;
end $$;

create function public.record_event_waiver_delivery(event_id_input text, message_id_input text, type_input text)
returns void language plpgsql security invoker set search_path='' as $$
declare o public.event_waiver_email_outbox; rows_changed integer;
begin
  insert into public.event_waiver_delivery_events(event_id,provider_message_id,event_type) values(event_id_input,message_id_input,type_input) on conflict do nothing;
  get diagnostics rows_changed=row_count; if rows_changed=0 then return; end if;
  select * into o from public.event_waiver_email_outbox where provider_message_id=message_id_input for update;
  if o.id is null then raise exception 'delivery_message_not_ready'; end if;
  if type_input in('email.bounced','email.complained','email.failed','email.delivered') then
    update public.event_waiver_email_outbox set status=case type_input when 'email.delivered' then 'delivered' when 'email.bounced' then 'bounced' when 'email.complained' then 'complained' else 'failed' end,updated_at=clock_timestamp()
      where id=o.id and (status not in('bounced','complained','cancelled') or type_input in('email.bounced','email.complained'));
    if o.kind in('invitation','reminder') then update public.event_waiver_assignments set status=case when type_input='email.delivered' then 'delivered' else 'bounced' end
      where id=o.assignment_id and generation=o.generation and status in('queued','sent','delivered'); end if;
  end if;
end $$;

create function private.immutable_v2_signature() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'waiver_evidence_immutable'; end $$;
create trigger immutable_v2_signature before update or delete on public.event_waiver_signatures for each row execute function private.immutable_v2_signature();
create trigger immutable_v2_participant before update or delete on public.event_waiver_participants for each row execute function private.immutable_v2_signature();

create function private.invalidate_v2_waivers() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.event_date is distinct from old.event_date then
    update public.event_waiver_assignments set status='needs_review',token_hash=null where registration_id in(select id from public.registrations where event_slug=new.slug);
    update public.events set enable_group_form=false,require_emailed_waiver=false where slug=new.slug;
  end if;
  return new;
end $$;
create trigger invalidate_v2_event_date after update of event_date on public.events for each row execute function private.invalidate_v2_waivers();

create function public.save_event_waiver_policy(event_slug_input text, zone_input text, adult_text_input text, guardian_text_input text,
  adult_sha_input text, guardian_sha_input text, actor_input text, group_enabled_input boolean, email_required_input boolean)
returns void language plpgsql security invoker set search_path='' as $$
declare e public.events; old_policy public.event_waiver_policies; policy public.event_waiver_policies; changed boolean;
begin
  select * into e from public.events where slug=event_slug_input for update;
  if e.slug is null or e.event_date is null or not exists(select 1 from pg_timezone_names where name=zone_input)
    or adult_sha_input!~'^[a-f0-9]{64}$' or guardian_sha_input!~'^[a-f0-9]{64}$' or length(actor_input)<1
    or (group_enabled_input and not email_required_input) then raise exception 'waiver_policy_invalid'; end if;
  select * into old_policy from public.event_waiver_policies where event_slug=e.slug;
  changed:=old_policy.event_slug is null or (old_policy.adult_text,old_policy.guardian_text,old_policy.event_date,old_policy.time_zone)
    is distinct from (adult_text_input,guardian_text_input,e.event_date,zone_input);
  insert into public.event_waiver_policies(event_slug,event_date,time_zone,adult_text,guardian_text,adult_sha,guardian_sha,approved_at,approved_by)
    values(e.slug,e.event_date,zone_input,adult_text_input,guardian_text_input,adult_sha_input,guardian_sha_input,clock_timestamp(),actor_input)
    on conflict(event_slug) do update set event_date=excluded.event_date,time_zone=excluded.time_zone,adult_text=excluded.adult_text,guardian_text=excluded.guardian_text,
      adult_sha=excluded.adult_sha,guardian_sha=excluded.guardian_sha,approved_at=excluded.approved_at,approved_by=excluded.approved_by,
      version=case when changed then gen_random_uuid() else public.event_waiver_policies.version end returning * into policy;
  if changed and old_policy.event_slug is not null then
    update public.event_waiver_assignments set status='invalidated',is_current=false,token_hash=null where is_current and registration_id in(select id from public.registrations where event_slug=e.slug);
    update public.event_waiver_email_outbox set status='cancelled',encrypted_payload=null where assignment_id in(select id from public.event_waiver_assignments where not is_current) and status in('queued','sending');
    insert into public.event_waiver_assignments(registration_id,participant_id,recipient_email,guardian_name,policy_version,waiver_text,waiver_sha,status)
      select r.id,p.id,coalesce(previous.recipient_email,p.recipient_email),coalesce(previous.guardian_name,p.guardian_name),policy.version,case when p.signer_role='guardian' then policy.guardian_text else policy.adult_text end,
        case when p.signer_role='guardian' then policy.guardian_sha else policy.adult_sha end,case when p.event_date=e.event_date then 'not_sent' else 'needs_review' end
      from public.registrations r join public.event_waiver_participants p on p.id=r.waiver_participant_id
      left join lateral(select recipient_email,guardian_name from public.event_waiver_assignments previous where previous.registration_id=r.id order by created_at desc limit 1) previous on true
      where r.event_slug=e.slug and r.status='confirmed';
  end if;
  update public.events set enable_group_form=group_enabled_input,require_emailed_waiver=email_required_input where slug=e.slug;
end $$;

create function public.replace_event_waiver_recipient(assignment_id_input uuid, email_input text, guardian_name_input text, actor_input text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare a public.event_waiver_assignments; p public.event_waiver_participants; r public.registrations; replacement uuid;
begin
  select * into a from public.event_waiver_assignments where id=assignment_id_input for update;
  select * into p from public.event_waiver_participants where id=a.participant_id;
  select * into r from public.registrations where id=a.registration_id;
  if a.id is null or not a.is_current or a.status in('signed','invalidated') or r.status<>'confirmed'
    or exists(select 1 from public.event_waiver_signatures where assignment_id=a.id)
    or email_input!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or (p.signer_role='guardian' and length(btrim(guardian_name_input)) not between 2 and 200)
    or (p.signer_role='attendee' and p.registration_kind='proxy' and lower(email_input)=lower(r.contact_email)) then raise exception 'waiver_recipient_locked'; end if;
  update public.event_waiver_assignments set status='invalidated',is_current=false,token_hash=null where id=a.id;
  update public.event_waiver_email_outbox set status='cancelled',encrypted_payload=null where assignment_id=a.id and status in('queued','sending');
  insert into public.event_waiver_assignments(registration_id,participant_id,recipient_email,guardian_name,policy_version,waiver_text,waiver_sha)
    values(r.id,p.id,lower(email_input),nullif(btrim(guardian_name_input),''),a.policy_version,a.waiver_text,a.waiver_sha) returning id into replacement;
  insert into public.registration_audit_events(registration_id,actor_id,action) values(r.id,actor_input,'v2_recipient_replaced');
  return replacement;
end $$;

create function public.staff_event_waiver_operation(registration_id_input uuid, operation_input text, actor_input text)
returns void language plpgsql security invoker set search_path='' as $$
declare r public.registrations; a public.event_waiver_assignments;
begin
  select * into r from public.registrations where id=registration_id_input for update;
  select * into a from public.event_waiver_assignments where registration_id=r.id and is_current for update;
  if a.id is null or r.status<>'confirmed' then raise exception 'waiver_operation_unavailable'; end if;
  if operation_input in('guardian_verified','identity_verified') then
    if a.status<>'needs_review' or not exists(select 1 from public.event_waiver_signatures where assignment_id=a.id) then raise exception 'signature_missing'; end if;
    if exists(select 1 from public.event_waiver_participants p join public.events e on e.slug=r.event_slug where p.id=a.participant_id and p.event_date<>e.event_date) then raise exception 'event_date_requires_new_details'; end if;
    update public.event_waiver_assignments set status='signed' where id=a.id;
  elsif operation_input='approve' then update public.registrations set approval_status='approved' where id=r.id;
  elsif operation_input='reject' then update public.registrations set approval_status='rejected',status='cancelled' where id=r.id;
  elsif operation_input='checkin' then
    if r.attendance_status='attended' then raise exception 'already_checked_in'; end if;
    update public.registrations set attendance_status='attended',attendance_source='admin',attendance_marked_at=clock_timestamp() where id=r.id;
  elsif operation_input='revoke' then
    update public.event_waiver_assignments set status='invalidated',token_hash=null where id=a.id;
    update public.event_waiver_email_outbox set status='cancelled',encrypted_payload=null where assignment_id=a.id and status in('queued','sending');
  elsif operation_input='reissue' then
    if exists(select 1 from public.event_waiver_participants p join public.events e on e.slug=r.event_slug where p.id=a.participant_id and p.event_date<>e.event_date) then raise exception 'event_date_requires_new_details'; end if;
    update public.event_waiver_assignments set status='invalidated',is_current=false,token_hash=null where id=a.id;
    update public.event_waiver_email_outbox set status='cancelled',encrypted_payload=null where assignment_id=a.id and status in('queued','sending');
    insert into public.event_waiver_assignments(registration_id,participant_id,recipient_email,guardian_name,policy_version,waiver_text,waiver_sha)
      values(r.id,a.participant_id,a.recipient_email,a.guardian_name,a.policy_version,a.waiver_text,a.waiver_sha);
  else raise exception 'waiver_operation_invalid'; end if;
  insert into public.registration_audit_events(registration_id,actor_id,action) values(r.id,actor_input,'v2_'||operation_input);
end $$;

create function public.cancel_event_booking_place(pending_id_input uuid, registration_id_input uuid, booker_id_input uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare h public.pending_registrations; r public.registrations;
begin
  if registration_id_input is not null then
    select * into r from public.registrations where id=registration_id_input for update;
    if r.id is null or r.waiver_participant_id is null or r.booker_member_id is distinct from booker_id_input
      or not (select allow_cancellation from public.events where slug=r.event_slug) then raise exception 'contact_staff_for_cancellation'; end if;
    update public.registrations set status='cancelled' where id=r.id;
    insert into public.registration_audit_events(registration_id,actor_id,action) values(r.id,booker_id_input::text,'v2_booker_cancelled');
  else
    select * into h from public.pending_registrations where id=pending_id_input for update;
    if h.id is null or h.waiver_participant_id is null or h.member_id is distinct from booker_id_input or h.fulfilled_registration_id is not null or h.checkout_attempt is not null then raise exception 'payment_verification_required_before_cancel'; end if;
    update public.pending_registrations set expires_at=clock_timestamp()-interval '1 second',hold_expires_at=clock_timestamp()-interval '1 second',superseded_at=clock_timestamp() where id=h.id;
  end if;
end $$;

create function private.guard_legacy_waiver_invitation() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from public.registrations where id=new.registration_id and waiver_participant_id is not null) then raise exception 'verified_waiver_flow_required'; end if;
  return new;
end $$;
create trigger guard_legacy_waiver_invitation before insert on public.registration_guest_invitations for each row execute function private.guard_legacy_waiver_invitation();

-- No public RPC grants, including future changes to database defaults.
do $$ declare fn regprocedure; begin
  for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in('create_event_booking_v2','queue_event_waiver','queue_event_waiver_code','verify_event_waiver_code','respond_event_waiver','claim_event_waiver_email','record_event_waiver_delivery','save_event_waiver_policy','replace_event_waiver_recipient','staff_event_waiver_operation','cancel_event_booking_place') loop
    execute format('revoke all on function %s from public,anon,authenticated',fn);
    execute format('grant execute on function %s to service_role',fn);
  end loop;
  for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in('guard_v2_pending','guard_v2_registration','sync_v2_registration','immutable_v2_signature','invalidate_v2_waivers','guard_legacy_waiver_invitation') loop
    execute format('revoke all on function %s from public,anon,authenticated',fn);
  end loop;
end $$;
commit;
