-- Restricted operational records. Contact numbers never enter tickets or exports.
create table public.event_waiver_accompaniments (
  participant_id uuid primary key references public.event_waiver_participants(id) on delete cascade,
  guardian_name text not null check(length(guardian_name) between 2 and 200),
  guardian_phone text not null check(guardian_phone ~ '^[+()0-9 .-]{7,40}$'),
  relationship text not null check(relationship in ('parent','legal_guardian')),
  present boolean not null default false, verified_by text, verified_at timestamptz
);
alter table public.event_waiver_accompaniments enable row level security;
revoke all on public.event_waiver_accompaniments from public, anon, authenticated;
grant all on public.event_waiver_accompaniments to service_role;

create function private.guard_event_v2_accompaniment() returns trigger
language plpgsql security invoker set search_path='' as $$
declare p public.event_waiver_participants;
begin
  if new.waiver_participant_id is null or new.attendance_status<>'attended' then return new; end if;
  select * into p from public.event_waiver_participants where id=new.waiver_participant_id;
  if extract(year from p.event_date)-extract(year from p.date_of_birth)-(to_char(p.event_date,'MM-DD')<to_char(p.date_of_birth,'MM-DD'))::integer<14
    and not exists(select 1 from public.event_waiver_accompaniments where participant_id=p.id and present) then raise exception 'accompanying_guardian_presence_required'; end if;
  return new;
end $$;
revoke all on function private.guard_event_v2_accompaniment() from public, anon, authenticated;
create trigger event_v2_accompaniment_guard before insert or update on public.registrations for each row execute function private.guard_event_v2_accompaniment();

create or replace function public.create_event_booking_v2(event_slug_input text, booker_id_input uuid, contact_email_input text,
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
    if birthday>(clock_timestamp() at time zone policy.time_zone)::date or birthday>e.event_date or birthday<e.event_date-interval '120 years' then raise exception 'participant_birth_date_invalid'; end if;
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
    if extract(year from e.event_date)-extract(year from birthday)-(to_char(e.event_date,'MM-DD')<to_char(birthday,'MM-DD'))::integer<14 then
      if coalesce((p->>'guardianWillAttend')::boolean,false) is not true
        or coalesce(length(btrim(p->>'accompanyingGuardianName')),0) not between 2 and 200
        or coalesce(p->>'accompanyingGuardianPhone','') !~ '^[+()0-9 .-]{7,40}$'
        or coalesce(p->>'accompanyingGuardianRelationship','') not in ('parent','legal_guardian') then raise exception 'accompanying_guardian_required'; end if;
      insert into public.event_waiver_accompaniments(participant_id,guardian_name,guardian_phone,relationship)
        values(participant,btrim(p->>'accompanyingGuardianName'),btrim(p->>'accompanyingGuardianPhone'),p->>'accompanyingGuardianRelationship');
    end if;
    insert into public.pending_registrations(event_slug,member_id,registration_kind,participant_key,attendee_email,answers,consent_given,
      contact_name,contact_email,contact_phone,token_hash,expires_at,hold_expires_at,booking_id,waiver_participant_id,preferred_language,coupon_code)
      values(e.slug,booker_id_input,p->>'kind',case when p->>'kind'='self' then 'self' else p->>'key' end,nullif(p->>'attendeeEmail',''),p->'answers',true,
        p->>'name',lower(contact_email_input),coalesce(p->'answers'->>'phone',''),'member-pending-'||gen_random_uuid(),
        clock_timestamp()+interval '24 hours',clock_timestamp()+interval '30 minutes',booking.id,participant,language_input,nullif(p->>'couponCode',''));
  end loop;
  return booking.id;
end $$;

create or replace function public.respond_event_waiver(token_hash_input text, proof_hash_input text, accepted_input boolean,
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
  if accepted_input and p.signer_role='attendee' and
    (extract(year from (clock_timestamp() at time zone (select time_zone from public.event_waiver_policies where event_slug=r.event_slug))::date)-extract(year from p.date_of_birth)
      -(to_char((clock_timestamp() at time zone (select time_zone from public.event_waiver_policies where event_slug=r.event_slug))::date,'MM-DD')<to_char(p.date_of_birth,'MM-DD'))::integer)<18
    then raise exception 'adult_signer_not_yet_eighteen'; end if;
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

create or replace function public.staff_event_waiver_operation(registration_id_input uuid, operation_input text, actor_input text)
returns void language plpgsql security invoker set search_path='' as $$
declare r public.registrations; a public.event_waiver_assignments;
begin
  select * into r from public.registrations where id=registration_id_input for update;
  select * into a from public.event_waiver_assignments where registration_id=r.id and is_current for update;
  if a.id is null or r.status<>'confirmed' then raise exception 'waiver_operation_unavailable'; end if;
  if operation_input in ('accompany_verified','accompany_left') then
    update public.event_waiver_accompaniments set present=(operation_input='accompany_verified'),verified_by=actor_input,verified_at=clock_timestamp() where participant_id=a.participant_id;
    if not found then raise exception 'accompaniment_not_required'; end if;
    if operation_input='accompany_left' then update public.registrations set attendance_status='unmarked',attendance_source='admin',attendance_marked_at=clock_timestamp() where id=r.id; end if;
  elsif operation_input in('guardian_verified','identity_verified') then
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
