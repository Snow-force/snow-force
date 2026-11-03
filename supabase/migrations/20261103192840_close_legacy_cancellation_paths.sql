-- All cancellations, including attendance rejection, must use the audited admin workflow.
CREATE OR REPLACE FUNCTION public.review_proxy_registration(registration_id_input uuid, approved_input boolean, actor_id_input text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.registrations;
begin
  if approved_input is distinct from true then raise exception 'cancellation_approval_required'; end if;
  if nullif(btrim(actor_id_input),'') is null or approved_input is null then raise exception 'review_actor_required'; end if;
  select * into r from public.registrations where id = registration_id_input for update;
  if not found or r.registration_kind <> 'proxy' or r.status <> 'confirmed' then raise exception 'registration_not_reviewable'; end if;
  if approved_input and r.approval_status = 'approved' then return; end if;
  if r.approval_status <> 'pending' then raise exception 'registration_not_reviewable'; end if;
  update public.registrations set approval_status='approved' where id=r.id;
  insert into public.registration_audit_events(registration_id,actor_id,action)
    values(r.id,actor_id_input,'guest_approved');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_event_waiver_operation(registration_id_input uuid, operation_input text, actor_input text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.registrations; a public.event_waiver_assignments;
begin
  if operation_input='reject' then raise exception 'cancellation_approval_required'; end if;
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
end $function$
;

revoke all on function public.review_proxy_registration(uuid,boolean,text),public.staff_event_waiver_operation(uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_proxy_registration(uuid,boolean,text),public.staff_event_waiver_operation(uuid,text,text) to service_role;

