-- Age is self-declared by the verified signer. Existing birthday-based evidence remains unchanged.
alter table public.event_waiver_participants
  alter column date_of_birth drop not null,
  add column age_confirmation_method text not null default 'birth_date' check(age_confirmation_method in ('birth_date','declaration')),
  drop constraint event_waiver_participants_signer_role_check,
  add constraint event_waiver_participants_signer_role_check check(signer_role in ('attendee','guardian','unconfirmed')),
  add constraint event_waiver_participant_age_method_check check(
    (age_confirmation_method='birth_date' and date_of_birth is not null and signer_role in ('attendee','guardian')) or
    (age_confirmation_method='declaration' and date_of_birth is null and signer_role='unconfirmed'));
alter table public.event_waiver_assignments
  add column declared_signer_role text check(declared_signer_role in ('attendee','guardian')),
  add column declared_under14 boolean;
alter table public.event_waiver_signatures
  add column adult_confirmed boolean,
  add column participant_under14 boolean,
  add constraint event_waiver_signature_age_declaration_check check(adult_confirmed is null or
    (adult_confirmed=(signer_role='attendee') and participant_under14 is not null and (not adult_confirmed or not participant_under14)));

create or replace function private.guard_event_v2_accompaniment() returns trigger
language plpgsql security invoker set search_path='' as $$
declare p public.event_waiver_participants; a public.event_waiver_assignments; needs_presence boolean;
begin
  if new.waiver_participant_id is null or new.attendance_status<>'attended' then return new; end if;
  select * into p from public.event_waiver_participants where id=new.waiver_participant_id;
  select * into a from public.event_waiver_assignments where registration_id=new.id and is_current;
  if p.age_confirmation_method='declaration' then
    if a.declared_signer_role is null or a.declared_under14 is null then raise exception 'waiver_age_confirmation_required'; end if;
    needs_presence:=a.declared_under14;
  else needs_presence:=extract(year from p.event_date)-extract(year from p.date_of_birth)-(to_char(p.event_date,'MM-DD')<to_char(p.date_of_birth,'MM-DD'))::integer<14; end if;
  if needs_presence and not exists(select 1 from public.event_waiver_accompaniments where participant_id=p.id and present) then raise exception 'accompanying_guardian_presence_required'; end if;
  return new;
end $$;

create function public.create_declared_event_booking_v2(event_slug_input text, booker_id_input uuid, contact_email_input text,
  request_key_input uuid, request_hash_input text, language_input text, participants_input jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare e public.events; policy public.event_waiver_policies; booking public.event_bookings; p jsonb;
  participant uuid; role_required text; self_count integer:=0; proxy_count integer:=0; identity_seen text[]:='{}'; candidate_duplicate boolean;
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
    role_required:='unconfirmed';
    if p->>'kind'='self' then self_count:=self_count+1;
      if exists(select 1 from public.registrations where event_slug=e.slug and member_id=booker_id_input and status<>'cancelled')
        or exists(select 1 from public.event_attendee_claims where event_slug=e.slug and member_id=booker_id_input) then raise exception 'participant_already_registered'; end if;
    elsif p->>'kind'='proxy' then proxy_count:=proxy_count+1;
    else raise exception 'participant_kind_invalid'; end if;
    if self_count>1 or proxy_count>e.max_proxy_registrations or (proxy_count>0 and not e.allow_proxy_registrations)
      or p->>'recipientEmail'!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 then raise exception 'participant_details_invalid'; end if;
    candidate_duplicate:=p->>'identityFingerprint'=any(identity_seen);
    identity_seen:=array_append(identity_seen,p->>'identityFingerprint');
    if p->>'kind'='self' then update public.pending_registrations set superseded_at=clock_timestamp(),expires_at=clock_timestamp()-interval '1 second',hold_expires_at=clock_timestamp()-interval '1 second'
      where member_id=booker_id_input and event_slug=e.slug and participant_key='self' and fulfilled_registration_id is null and checkout_attempt is null
        and superseded_at is null and (expires_at<=clock_timestamp() or hold_expires_at<=clock_timestamp()); end if;
    insert into public.event_waiver_participants(booking_id,participant_key,registration_kind,attendee_name,age_confirmation_method,date_of_birth,event_date,
      signer_role,recipient_email,guardian_name,guardian_relationship,identity_fingerprint,policy_version,waiver_text,waiver_sha,payment_model,requires_approval,quoted_amount,payment_currency,review_required)
      values(booking.id,(p->>'key')::uuid,p->>'kind',p->>'name','declaration',null,e.event_date,role_required,lower(p->>'recipientEmail'),
        null,null,p->>'identityFingerprint',policy.version,
        case when role_required='guardian' then policy.guardian_text else policy.adult_text end,
        case when role_required='guardian' then policy.guardian_sha else policy.adult_sha end,e.payment_model,e.requires_approval,
        coalesce((p->>'quotedAmount')::numeric,case when e.payment_model='free' then 0 when e.payment_model='deposit' then e.deposit_amount else e.full_payment_amount end),e.deposit_currency,
        candidate_duplicate or exists(select 1 from public.event_waiver_participants previous join public.event_bookings pb on pb.id=previous.booking_id where pb.event_slug=e.slug and previous.identity_fingerprint=p->>'identityFingerprint'
          and (exists(select 1 from public.registrations r where r.waiver_participant_id=previous.id and r.status<>'cancelled')
            or exists(select 1 from public.pending_registrations h where h.waiver_participant_id=previous.id and h.fulfilled_registration_id is null and h.superseded_at is null and (h.hold_expires_at>clock_timestamp() or h.checkout_attempt is not null))))) returning id into participant;
    insert into public.pending_registrations(event_slug,member_id,registration_kind,participant_key,attendee_email,answers,consent_given,
      contact_name,contact_email,contact_phone,token_hash,expires_at,hold_expires_at,booking_id,waiver_participant_id,preferred_language,coupon_code)
      values(e.slug,booker_id_input,p->>'kind',case when p->>'kind'='self' then 'self' else p->>'key' end,null,(p->'answers')-'dateOfBirth'-'date_of_birth'-'email',true,
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
  if p.age_confirmation_method='declaration' then raise exception 'age_declaration_required'; end if;
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

create function public.respond_declared_event_waiver(token_hash_input text, proof_hash_input text, accepted_input boolean,
  signer_name_input text, declaration_input jsonb, guardian_attested_input boolean, member_id_input uuid, ip_digest_input text, ua_digest_input text, receipt_payload_input text)
returns void language plpgsql security invoker set search_path='' as $$
declare a public.event_waiver_assignments; p public.event_waiver_participants; c public.event_waiver_challenges; r public.registrations;
  policy public.event_waiver_policies; adult boolean; under14 boolean; role_required text; legal_text text; legal_sha text;
begin
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
  if p.age_confirmation_method<>'declaration' then raise exception 'waiver_age_method_locked'; end if;
  select * into policy from public.event_waiver_policies where event_slug=r.event_slug;
  if policy.version is distinct from a.policy_version or policy.event_date<>p.event_date or policy.event_date<>(select event_date from public.events where slug=r.event_slug) then raise exception 'waiver_policy_changed'; end if;
  if accepted_input then
    if jsonb_typeof(declaration_input->'adultConfirmed') is distinct from 'boolean' or jsonb_typeof(declaration_input->'under14') is distinct from 'boolean' then raise exception 'waiver_age_confirmation_required'; end if;
    adult:=(declaration_input->>'adultConfirmed')::boolean; under14:=(declaration_input->>'under14')::boolean;
    if adult and under14 then raise exception 'waiver_age_confirmation_invalid'; end if;
    role_required:=case when adult then 'attendee' else 'guardian' end;
    if length(btrim(signer_name_input)) not between 2 and 200 or signer_name_input is null then raise exception 'waiver_signature_required'; end if;
    if adult then
      if lower(btrim(signer_name_input))<>lower(btrim(p.attendee_name)) then raise exception 'attendee_name_mismatch'; end if;
      if (r.registration_kind='proxy' and (lower(a.recipient_email)=lower(r.contact_email) or member_id_input=r.booker_member_id))
        or (r.registration_kind='self' and lower(a.recipient_email)<>lower(r.contact_email)) then raise exception 'own_attendee_email_required'; end if;
      if member_id_input is not null then
        if exists(select 1 from public.registrations where event_slug=r.event_slug and member_id=member_id_input and status<>'cancelled' and id<>r.id) then raise exception 'participant_already_registered'; end if;
        insert into public.event_attendee_claims(event_slug,member_id,registration_id) values(r.event_slug,member_id_input,r.id);
      end if;
    elsif guardian_attested_input is distinct from true or coalesce(declaration_input->>'guardianRelationship','') not in ('parent','legal_guardian') then raise exception 'guardian_authority_required'; end if;
    if under14 then
      if coalesce((declaration_input->>'guardianWillAttend')::boolean,false) is not true
        or coalesce(length(btrim(declaration_input->>'accompanyingGuardianName')),0) not between 2 and 200
        or coalesce(declaration_input->>'accompanyingGuardianPhone','') !~ '^[+()0-9 .-]{7,40}$'
        or length(regexp_replace(coalesce(declaration_input->>'accompanyingGuardianPhone',''),'[^0-9]','','g'))<7
        or coalesce(declaration_input->>'accompanyingGuardianRelationship','') not in ('parent','legal_guardian') then raise exception 'accompanying_guardian_required'; end if;
      insert into public.event_waiver_accompaniments(participant_id,guardian_name,guardian_phone,relationship)
        values(p.id,btrim(declaration_input->>'accompanyingGuardianName'),btrim(declaration_input->>'accompanyingGuardianPhone'),declaration_input->>'accompanyingGuardianRelationship')
        on conflict(participant_id) do update set guardian_name=excluded.guardian_name,guardian_phone=excluded.guardian_phone,relationship=excluded.relationship,present=false,verified_at=null,verified_by=null;
    end if;
    legal_text:=case when adult then policy.adult_text else policy.guardian_text end;
    legal_sha:=case when adult then policy.adult_sha else policy.guardian_sha end;
    insert into public.event_waiver_signatures(assignment_id,registration_id,signer_role,signer_name,verified_email,guardian_relationship,
      policy_version,legal_text_snapshot,waiver_sha,email_verified_at,ip_digest,user_agent_digest,adult_confirmed,participant_under14)
      values(a.id,r.id,role_required,btrim(signer_name_input),a.recipient_email,case when adult then null else declaration_input->>'guardianRelationship' end,
        a.policy_version,legal_text,legal_sha,c.verified_at,ip_digest_input,ua_digest_input,adult,under14);
    update public.event_waiver_assignments set declared_signer_role=role_required,declared_under14=under14,
      guardian_name=case when adult then null else btrim(signer_name_input) end,waiver_text=legal_text,waiver_sha=legal_sha where id=a.id;
  end if;
  update public.event_waiver_challenges set consumed_at=clock_timestamp() where assignment_id=a.id;
  update public.event_waiver_assignments set status=case when not accepted_input then 'declined' when not adult or p.review_required then 'needs_review' else 'signed' end where id=a.id;
  insert into public.event_waiver_email_outbox(assignment_id,generation,kind,recipient_email,encrypted_payload,idempotency_key)
    values(a.id,a.generation,case when accepted_input then 'signed' else 'declined' end,a.recipient_email,receipt_payload_input,'waiver-receipt/'||a.id||'/'||a.generation);
  if r.registration_kind='proxy' then update public.registrations set attendee_confirmation_status=case when accepted_input then 'accepted' else 'declined' end where id=r.id; end if;
  insert into public.registration_audit_events(registration_id,actor_id,action) values(r.id,'waiver:'||a.id,case when accepted_input then 'v2_waiver_signed' else 'v2_waiver_declined' end);
end $$;

revoke all on function public.create_declared_event_booking_v2(text,uuid,text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_declared_event_booking_v2(text,uuid,text,uuid,text,text,jsonb) to service_role;
revoke all on function public.respond_declared_event_waiver(text,text,boolean,text,jsonb,boolean,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.respond_declared_event_waiver(text,text,boolean,text,jsonb,boolean,uuid,text,text,text) to service_role;
