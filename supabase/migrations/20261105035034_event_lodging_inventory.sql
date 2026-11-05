-- Internal inventory primitives only. The catalog sales_enabled=false constraint remains.
-- Local hotel dates are [check_in, check_out); no timestamp/DST arithmetic is used.
create table public.lodging_units (
 id uuid primary key default gen_random_uuid(),
 room_type_id uuid not null references public.lodging_room_types(id) on delete restrict,
 internal_code text not null check(length(trim(internal_code)) between 1 and 100),
 supply_reference text not null check(length(trim(supply_reference)) between 1 and 500),
 continuity_confirmed boolean not null check(continuity_confirmed),
 updated_by uuid not null,
 created_at timestamptz not null default now(),
 unique(room_type_id,internal_code)
);
create table public.lodging_inventory_holds (
 id uuid primary key default gen_random_uuid(),
 room_type_id uuid not null references public.lodging_room_types(id) on delete restrict,
 offer_id uuid references public.event_lodging_offers(id) on delete restrict,
 request_key uuid not null,
 check_in date not null, check_out date not null,
 quantity integer not null check(quantity between 1 and 10),
 kind text not null check(kind in ('hold','manual')),
 state text not null default 'active' check(state in ('active','released')),
 payment_state text not null default 'not_started'
   check(payment_state in ('not_started','creating','open','processing','unknown','paid','unpaid_terminal')),
 expires_at timestamptz,
 reason text not null check(length(trim(reason)) between 1 and 500),
 updated_by uuid not null,
 created_at timestamptz not null default now(),
 released_at timestamptz,
 check(check_out>check_in and check_out-check_in<=30),
 check((kind='hold' and expires_at is not null) or (kind='manual' and expires_at is null)),
 check((state='active' and released_at is null) or (state='released' and released_at is not null)),
 unique(updated_by,request_key)
);
create table public.lodging_unit_nights (
 id uuid primary key default gen_random_uuid(),
 unit_id uuid not null references public.lodging_units(id) on delete restrict,
 stay_date date not null,
 blocked boolean not null default false,
 hold_id uuid references public.lodging_inventory_holds(id) on delete restrict,
 updated_by uuid not null,
 created_at timestamptz not null default now(),
 unique(unit_id,stay_date),
 check(not blocked or hold_id is null)
);
create index lodging_inventory_hold_room_idx on public.lodging_inventory_holds(room_type_id);
create index lodging_inventory_offer_idx on public.lodging_inventory_holds(offer_id);
create index lodging_night_hold_idx on public.lodging_unit_nights(hold_id) where hold_id is not null;

-- All supply mutations and reservations use the same room-type lock. Lock before
-- checking occupancy, so a staff supply reduction cannot race a reservation.
create function public.guard_lodging_supply() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_room uuid; v_unit uuid;
begin
 if tg_table_name='lodging_units' then
   v_room := case when tg_op='DELETE' then old.room_type_id else new.room_type_id end;
   if tg_op='UPDATE' and new.room_type_id<>old.room_type_id then raise exception 'Unit room type is immutable'; end if;
 else
   v_unit := case when tg_op='DELETE' then old.unit_id else new.unit_id end;
   select room_type_id into v_room from public.lodging_units where id=v_unit;
   if tg_op='UPDATE' and (new.unit_id<>old.unit_id or new.stay_date<>old.stay_date) then
     raise exception 'Night identity is immutable';
   end if;
 end if;
 perform 1 from public.lodging_room_types where id=v_room for update;
 if tg_table_name='lodging_unit_nights' then
   if tg_op='DELETE' and old.hold_id is not null then
     raise exception 'Occupied supply cannot be removed';
   end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 if tg_table_name='lodging_unit_nights' then
   if tg_op='UPDATE' and old.hold_id is not null and new.hold_id is distinct from old.hold_id
     and exists(select 1 from public.lodging_inventory_holds where id=old.hold_id and state='active') then
     raise exception 'Active allocation cannot be overwritten';
   end if;
   if new.hold_id is not null and not exists(
     select 1 from public.lodging_inventory_holds h where h.id=new.hold_id and h.room_type_id=v_room
       and h.state='active' and new.stay_date>=h.check_in and new.stay_date<h.check_out
   ) then raise exception 'Allocation does not match active hold'; end if;
 end if;
 return new;
end;$$;
create trigger lodging_unit_supply_guard before insert or update or delete on public.lodging_units
 for each row execute function public.guard_lodging_supply();
create trigger lodging_night_supply_guard before insert or update or delete on public.lodging_unit_nights
 for each row execute function public.guard_lodging_supply();
create trigger lodging_unit_audit after insert or update on public.lodging_units
 for each row execute function public.audit_lodging_catalog();
create trigger lodging_night_audit after insert or update on public.lodging_unit_nights
 for each row execute function public.audit_lodging_catalog();
create trigger lodging_hold_audit after insert or update on public.lodging_inventory_holds
 for each row execute function public.audit_lodging_catalog();

-- Internal service-role RPC: callers must authorize before invoking it. Draft
-- offers are allowed for isolated acceptance; no member action exposes this RPC.
create function public.reserve_lodging_inventory(
 p_room uuid,p_check_in date,p_check_out date,p_quantity integer,
 p_actor uuid,p_request_key uuid,p_kind text,p_reason text,p_offer uuid default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_existing public.lodging_inventory_holds; v_units uuid[]; v_id uuid;
begin
 if p_room is null or p_actor is null or p_request_key is null or p_check_in is null or p_check_out is null
   or p_quantity is null or p_quantity not between 1 and 10
   or p_check_out<=p_check_in or p_check_out-p_check_in>30
   or p_kind is null or p_kind not in ('hold','manual')
   or p_reason is null or length(trim(p_reason)) not between 1 and 500 then
   raise exception 'Invalid inventory request';
 end if;
 perform 1 from public.lodging_room_types where id=p_room for update;
 if not found then raise exception 'Unknown room type'; end if;
 select * into v_existing from public.lodging_inventory_holds where updated_by=p_actor and request_key=p_request_key;
 if found then
   if v_existing.room_type_id<>p_room or v_existing.check_in<>p_check_in or v_existing.check_out<>p_check_out
     or v_existing.quantity<>p_quantity or v_existing.kind<>p_kind or v_existing.reason<>trim(p_reason)
     or v_existing.offer_id is distinct from p_offer then raise exception 'Idempotency conflict'; end if;
   return v_existing.id;
 end if;
 if p_offer is not null then
   perform 1 from public.event_lodging_offers where id=p_offer and room_type_id=p_room
     and check_in=p_check_in and check_out=p_check_out for share;
   if not found then raise exception 'Offer does not match inventory request'; end if;
 end if;
 select array_agg(id order by id) into v_units from (
   select u.id from public.lodging_units u
   join public.lodging_unit_nights n on n.unit_id=u.id
   where u.room_type_id=p_room and n.stay_date>=p_check_in and n.stay_date<p_check_out
   group by u.id
   having count(*)=p_check_out-p_check_in and bool_and(not n.blocked and n.hold_id is null)
   order by u.id limit p_quantity
 ) candidates;
 if coalesce(cardinality(v_units),0)<>p_quantity then raise exception 'Insufficient continuous inventory'; end if;
 insert into public.lodging_inventory_holds(room_type_id,offer_id,request_key,check_in,check_out,quantity,kind,reason,updated_by,expires_at)
 values(p_room,p_offer,p_request_key,p_check_in,p_check_out,p_quantity,p_kind,trim(p_reason),p_actor,
   case when p_kind='hold' then clock_timestamp()+interval '10 minutes' else null end) returning id into v_id;
 update public.lodging_unit_nights set hold_id=v_id,updated_by=p_actor
 where unit_id=any(v_units) and stay_date>=p_check_in and stay_date<p_check_out;
 return v_id;
end;$$;

-- Expiration alone is never enough once Checkout may have started. The payment
-- batch must reconcile Stripe before recording unpaid_terminal under this lock.
create function public.release_lodging_inventory(p_hold uuid,p_actor uuid,p_reason text)
 returns boolean language plpgsql security invoker set search_path='' as $$
declare v_hold public.lodging_inventory_holds; v_room uuid;
begin
 if p_actor is null or p_reason is null or length(trim(p_reason)) not between 1 and 500 then
   raise exception 'Release requires actor and reason';
 end if;
 select room_type_id into v_room from public.lodging_inventory_holds where id=p_hold;
 if not found then raise exception 'Unknown inventory hold'; end if;
 perform 1 from public.lodging_room_types where id=v_room for update;
 select * into v_hold from public.lodging_inventory_holds where id=p_hold for update;
 if v_hold.state='released' then return false; end if;
 if v_hold.payment_state not in ('not_started','unpaid_terminal') then
   raise exception 'Payment reconciliation required';
 end if;
 if v_hold.kind='hold' and v_hold.payment_state='not_started' and v_hold.expires_at>clock_timestamp() then
   raise exception 'Hold has not expired';
 end if;
 -- Preserve the request actor/key for idempotency; release actor is in night audit
 -- and the dedicated release audit record below.
 update public.lodging_inventory_holds set state='released',released_at=clock_timestamp() where id=p_hold;
 update public.lodging_unit_nights set hold_id=null,updated_by=p_actor where hold_id=p_hold;
 insert into public.lodging_catalog_audit(entity_table,entity_id,actor,old_row,new_row)
 values('lodging_inventory_release',p_hold,p_actor,to_jsonb(v_hold),jsonb_build_object('reason',trim(p_reason),'state','released'));
 return true;
end;$$;

alter table public.lodging_units enable row level security;
alter table public.lodging_unit_nights enable row level security;
alter table public.lodging_inventory_holds enable row level security;
revoke all on public.lodging_units,public.lodging_unit_nights,public.lodging_inventory_holds from public,anon,authenticated;
grant select,insert,update on public.lodging_units,public.lodging_unit_nights,public.lodging_inventory_holds to service_role;
revoke all on function public.guard_lodging_supply() from public,anon,authenticated;
revoke all on function public.reserve_lodging_inventory(uuid,date,date,integer,uuid,uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.release_lodging_inventory(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.guard_lodging_supply() to service_role;
grant execute on function public.reserve_lodging_inventory(uuid,date,date,integer,uuid,uuid,text,text,uuid) to service_role;
grant execute on function public.release_lodging_inventory(uuid,uuid,text) to service_role;
