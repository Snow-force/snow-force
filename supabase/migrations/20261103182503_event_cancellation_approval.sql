-- Cancellation approval is independent of registration, refund and settlement status.
create table public.registration_cancellation_requests (
 id uuid primary key default gen_random_uuid(),
 registration_id uuid not null references public.registrations(id) on delete restrict,
 requested_by uuid references public.member_profiles(id),
 reason text not null check(length(btrim(reason)) between 3 and 2000),
 status text not null default 'pending' check(status in ('pending','approved','rejected','withdrawn')),
 decision_note text not null default '',
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 refund_amount numeric(10,2) not null default 0 check(refund_amount>=0),
 refund_operation_id uuid unique,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
create unique index registration_cancellation_one_pending on public.registration_cancellation_requests(registration_id) where status='pending';
create index registration_cancellation_registration on public.registration_cancellation_requests(registration_id,created_at desc);
create index registration_cancellation_requester on public.registration_cancellation_requests(requested_by);
create index registration_cancellation_reviewer on public.registration_cancellation_requests(reviewed_by);
alter table public.registration_cancellation_requests enable row level security;
revoke all on public.registration_cancellation_requests from public,anon,authenticated;
grant all on public.registration_cancellation_requests to service_role;

-- Only server commands can mutate requests; the caller identity is resolved by server auth.
create function public.request_registration_cancellation(registration_id_input uuid, booker_id_input uuid, reason_input text)
returns uuid language plpgsql set search_path='' as $$
declare r public.registrations; existing uuid; request_id uuid;
begin
 select * into r from public.registrations where id=registration_id_input for update;
 if r.id is null or coalesce(r.booker_member_id,r.member_id) is distinct from booker_id_input or booker_id_input is null
   or r.status='cancelled' or r.attendance_status='attended'
   or not coalesce((select allow_cancellation from public.events where slug=r.event_slug),false)
   then raise exception 'cancellation_request_unavailable'; end if;
 if reason_input is null or length(btrim(reason_input)) not between 3 and 2000 then raise exception 'cancellation_reason_required'; end if;
 select id into existing from public.registration_cancellation_requests where registration_id=r.id and status='pending';
 if found then return existing; end if;
 insert into public.registration_cancellation_requests(registration_id,requested_by,reason)
 values(r.id,booker_id_input,btrim(reason_input)) returning id into request_id;
 insert into public.registration_audit_events(registration_id,actor_id,action) values(r.id,booker_id_input::text,'cancellation_requested:'||request_id);
 insert into public.notifications(profile_id,type,title,body,href)
 select mp.id,'registration_changed','Cancellation requested / 取消申请待审核',r.contact_name||' · '||r.event_slug,'/admin/registrations#cancellations'
 from public.member_profiles mp join public.staff_roles sr on sr.user_id=mp.user_id where sr.role='admin';
 return request_id;
end $$;

create function public.withdraw_registration_cancellation(request_id_input uuid, booker_id_input uuid)
returns void language plpgsql set search_path='' as $$
declare c public.registration_cancellation_requests;
begin
 select * into c from public.registration_cancellation_requests where id=request_id_input for update;
 if c.id is null or c.requested_by is distinct from booker_id_input or booker_id_input is null or c.status<>'pending' then raise exception 'cancellation_request_locked'; end if;
 update public.registration_cancellation_requests set status='withdrawn',updated_at=clock_timestamp() where id=c.id;
 insert into public.registration_audit_events(registration_id,actor_id,action) values(c.registration_id,booker_id_input::text,'cancellation_withdrawn:'||c.id);
end $$;

create function public.review_registration_cancellation(request_id_input uuid, actor_id_input uuid, approved_input boolean, refund_amount_input numeric, note_input text)
returns void language plpgsql set search_path='' as $$
declare c public.registration_cancellation_requests; r public.registrations;
begin
 if not exists(select 1 from public.staff_roles where user_id=actor_id_input and role='admin') then raise exception 'admin_required'; end if;
 -- Same lock order as request creation: registration, then request.
 select * into r from public.registrations where id=(select registration_id from public.registration_cancellation_requests where id=request_id_input) for update;
 select * into c from public.registration_cancellation_requests where id=request_id_input for update;
 if c.id is null or c.status<>'pending' or r.status='cancelled' then raise exception 'cancellation_request_locked'; end if;
 if approved_input is null or note_input is null or length(btrim(note_input)) not between 3 and 2000 or refund_amount_input is null
   or refund_amount_input<0 or refund_amount_input<>round(refund_amount_input,2) or (not approved_input and refund_amount_input<>0)
   or refund_amount_input>greatest(0,coalesce(r.deposit_amount,0)-coalesce(r.refunded_amount,0))
   or (refund_amount_input>0 and (r.payment_method is distinct from 'stripe' or r.stripe_payment_intent_id is null))
   then raise exception 'cancellation_decision_invalid'; end if;
 if exists(select 1 from public.registration_refunds where registration_id=r.id and status in ('creating','pending','requires_action')) then raise exception 'refund_in_progress'; end if;
 update public.registration_cancellation_requests set status=case when approved_input then 'approved' else 'rejected' end,
 decision_note=btrim(note_input),reviewed_by=actor_id_input,reviewed_at=clock_timestamp(),updated_at=clock_timestamp(),
 refund_amount=refund_amount_input,refund_operation_id=case when refund_amount_input>0 then gen_random_uuid() else null end where id=c.id;
 if approved_input then update public.registrations set status='cancelled' where id=r.id; end if;
 insert into public.registration_audit_events(registration_id,actor_id,action) values(r.id,actor_id_input::text,case when approved_input then 'cancellation_approved:' else 'cancellation_rejected:' end||c.id);
 if coalesce(r.booker_member_id,r.member_id) is not null then
 insert into public.notifications(profile_id,type,title,body,href) values(coalesce(r.booker_member_id,r.member_id),'registration_changed',
 case when approved_input then 'Cancellation approved / 取消已批准' else 'Cancellation rejected / 取消申请被拒绝' end,
 r.contact_name||' · '||btrim(note_input)||' · Approved refund / 批准退款: '||refund_amount_input,'/member/trips#cancellations'); end if;
end $$;

-- Block stale member clients from immediately cancelling an issued ticket.
create or replace function public.cancel_event_booking_place(pending_id_input uuid, registration_id_input uuid, booker_id_input uuid)
returns void language plpgsql set search_path='' as $$
declare h public.pending_registrations;
begin
 if registration_id_input is not null then raise exception 'cancellation_request_required'; end if;
 select * into h from public.pending_registrations where id=pending_id_input for update;
 if h.id is null or h.waiver_participant_id is null or h.member_id is distinct from booker_id_input or booker_id_input is null
 or h.fulfilled_registration_id is not null or h.checkout_attempt is not null then raise exception 'payment_verification_required_before_cancel'; end if;
 update public.pending_registrations set expires_at=clock_timestamp()-interval '1 second',hold_expires_at=clock_timestamp()-interval '1 second',superseded_at=clock_timestamp() where id=h.id;
end $$;

revoke all on function public.request_registration_cancellation(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.withdraw_registration_cancellation(uuid,uuid) from public,anon,authenticated;
revoke all on function public.review_registration_cancellation(uuid,uuid,boolean,numeric,text) from public,anon,authenticated;
revoke all on function public.cancel_event_booking_place(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.request_registration_cancellation(uuid,uuid,text),public.withdraw_registration_cancellation(uuid,uuid),public.review_registration_cancellation(uuid,uuid,boolean,numeric,text),public.cancel_event_booking_place(uuid,uuid,uuid) to service_role;

create function public.admin_cancel_registration(registration_id_input uuid,actor_id_input uuid,note_input text)
returns void language plpgsql set search_path='' as $$
declare r public.registrations; request_id uuid;
begin
 if not exists(select 1 from public.staff_roles where user_id=actor_id_input and role='admin') then raise exception 'admin_required'; end if;
 select * into r from public.registrations where id=registration_id_input for update;
 if r.id is null or r.status='cancelled' or note_input is null or length(btrim(note_input)) not between 3 and 2000 then raise exception 'cancellation_reason_required'; end if;
 if exists(select 1 from public.registration_cancellation_requests where registration_id=r.id and status='pending') then raise exception 'review_existing_request_first'; end if;
 insert into public.registration_cancellation_requests(registration_id,reason,status,decision_note,reviewed_by,reviewed_at)
 values(r.id,btrim(note_input),'approved',btrim(note_input),actor_id_input,clock_timestamp()) returning id into request_id;
 update public.registrations set status='cancelled' where id=r.id;
 insert into public.registration_audit_events(registration_id,actor_id,action) values(r.id,actor_id_input::text,'admin_cancelled_without_refund:'||request_id);
 if coalesce(r.booker_member_id,r.member_id) is not null then
 insert into public.notifications(profile_id,type,title,body,href) values(coalesce(r.booker_member_id,r.member_id),'registration_changed','Registration cancelled / 报名已取消',btrim(note_input)||' · No refund issued / 未发起退款','/member/trips#cancellations'); end if;
end $$;
revoke all on function public.admin_cancel_registration(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_cancel_registration(uuid,uuid,text) to service_role;

-- Durable transactional mail. UI state never depends on email delivery.
create table public.registration_cancellation_mail (
 id uuid primary key default gen_random_uuid(),
 registration_id uuid not null references public.registrations(id),
 event_key text not null unique,
 audience text not null check(audience in ('member','staff')),
 subject text not null,
 body text not null,
 status text not null default 'queued' check(status in ('queued','sending','sent','failed')),
 attempts integer not null default 0,
 available_at timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default clock_timestamp(),
 sent_at timestamptz
);
create index registration_cancellation_mail_registration on public.registration_cancellation_mail(registration_id);
alter table public.registration_cancellation_mail enable row level security;
revoke all on public.registration_cancellation_mail from public,anon,authenticated;
grant all on public.registration_cancellation_mail to service_role;
create function private.queue_cancellation_mail() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and new.status=old.status then return new; end if;
 insert into public.registration_cancellation_mail(registration_id,event_key,audience,subject,body)
 values(new.registration_id,new.id||'/'||new.status||'/member','member','SnowForce cancellation update / 取消申请更新',
 'Status / 状态: '||new.status||'. '||case when new.status='pending' then 'Your place remains reserved until admin approval. No automatic refund. / 管理员批准前保留名额，不自动退款。'
 else new.decision_note||' Approved refund / 批准退款: '||new.refund_amount end);
 if new.status='pending' then
 insert into public.registration_cancellation_mail(registration_id,event_key,audience,subject,body)
 values(new.registration_id,new.id||'/pending/staff','staff','SnowForce cancellation needs approval / 取消申请待审核','A member requested cancellation. Review the participant, reason and payment in the admin panel. / 请在后台核对参加者、原因及付款。');
 end if;
 return new;
end $$;
create trigger cancellation_request_mail after insert or update on public.registration_cancellation_requests for each row execute function private.queue_cancellation_mail();
create function private.queue_cancellation_refund_mail() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and new.status=old.status then return new; end if;
 if new.status in ('succeeded','failed','canceled','requires_action') then
 insert into public.registration_cancellation_mail(registration_id,event_key,audience,subject,body)
 values(new.registration_id,'refund/'||new.id||'/'||new.status,'member','SnowForce refund update / 退款状态更新',
 'Refund / 退款: '||new.amount||' '||upper(new.currency)||'. Status / 状态: '||new.status||'. Check your trips for the current result. / 请在我的行程中查看最新结果。') on conflict(event_key) do nothing;
 end if;
 return new;
end $$;
create trigger cancellation_refund_mail after insert or update on public.registration_refunds for each row execute function private.queue_cancellation_refund_mail();
create function public.claim_cancellation_mail() returns setof public.registration_cancellation_mail language sql set search_path='' as $$
 update public.registration_cancellation_mail set status='sending',attempts=attempts+1,available_at=clock_timestamp()+interval '5 minutes'
 where id in(select id from public.registration_cancellation_mail where status in ('queued','sending') and attempts<8 and available_at<=clock_timestamp() order by created_at for update skip locked limit 10)
 returning *;
$$;
revoke all on function public.claim_cancellation_mail() from public,anon,authenticated;
grant execute on function public.claim_cancellation_mail() to service_role;

-- Prevent two different refund operations racing on the same participant payment.
create unique index registration_refunds_one_inflight on public.registration_refunds(registration_id) where status in ('creating','pending','requires_action');
