-- Approval is separate from payment, attendee consent and cancellation.
-- Existing tickets retain their prior behavior; new proxy tickets capture the
-- event's approval requirement at creation so later event edits cannot bypass it.
begin;
alter table public.registrations add column approval_status text not null default 'not_required'
  check (approval_status in ('not_required','pending','approved','rejected'));
create index registrations_approval_queue on public.registrations(event_slug,created_at)
  where approval_status = 'pending' and status <> 'cancelled';

create function private.guard_proxy_approval()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.registration_kind = 'proxy' then
    if (select requires_approval from public.events where slug = new.event_slug) then
      new.approval_status := 'pending';
    else new.approval_status := 'not_required'; end if;
  end if;
  if new.approval_status = 'rejected' and new.status <> 'cancelled' then
    raise exception 'rejected_registration_must_remain_cancelled';
  end if;
  if new.registration_kind = 'proxy' and new.attendance_status = 'attended'
    and new.approval_status not in ('not_required','approved') then
    raise exception 'registration_approval_required';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_proxy_approval() from public,anon,authenticated;
create trigger guard_proxy_approval before insert or update on public.registrations
  for each row execute function private.guard_proxy_approval();

create function public.review_proxy_registration(registration_id_input uuid, approved_input boolean, actor_id_input text)
returns void language plpgsql security invoker set search_path = '' as $$
declare r public.registrations;
begin
  if nullif(btrim(actor_id_input),'') is null or approved_input is null then raise exception 'review_actor_required'; end if;
  select * into r from public.registrations where id = registration_id_input for update;
  if not found or r.registration_kind <> 'proxy' or r.status <> 'confirmed' then raise exception 'registration_not_reviewable'; end if;
  if approved_input and r.approval_status = 'approved' then return; end if;
  if r.approval_status <> 'pending' then raise exception 'registration_not_reviewable'; end if;
  update public.registrations set approval_status = case when approved_input then 'approved' else 'rejected' end,
    status = case when approved_input then status else 'cancelled' end where id = r.id;
  if not approved_input then
    update public.registration_guest_invitations set status = 'revoked' where registration_id = r.id and status = 'issued';
  end if;
  insert into public.registration_audit_events(registration_id,actor_id,action)
    values(r.id,actor_id_input,case when approved_input then 'guest_approved' else 'guest_rejected_refund_review' end);
end;
$$;
revoke all on function public.review_proxy_registration(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.review_proxy_registration(uuid,boolean,text) to service_role;
commit;
