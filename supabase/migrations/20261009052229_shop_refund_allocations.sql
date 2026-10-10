-- Private reservations only. No payment or tax provider is called by this
-- migration. Started reservations retain their quantities until reconciliation.
create table commerce.snowforce_refund_allocations (
  id uuid primary key,
  sequence bigint generated always as identity unique,
  order_id text not null references commerce."order"(id),
  sale_task_id uuid not null references commerce.snowforce_tax_sale_tasks(id),
  case_id uuid not null references commerce.snowforce_after_sales(id),
  case_version integer not null check (case_version>0),
  native_return_id text not null references commerce."return"(id),
  staff_id text not null references commerce."user"(id),
  account_id text not null check (account_id ~ '^acct_[A-Za-z0-9]+$'),
  livemode boolean not null,
  payment_id text not null references commerce.payment(id),
  total_cents integer not null check (total_cents between 1 and 99999999),
  input jsonb not null check (coalesce(jsonb_typeof(input)='object'
    and input ?& array['items','refund_shipping','fee_decisions']
    and jsonb_typeof(input->'items')='array' and jsonb_array_length(input->'items')<=100
    and jsonb_typeof(input->'refund_shipping')='boolean'
    and jsonb_typeof(input->'fee_decisions')='array' and octet_length(input::text)<=262144,false)),
  input_fingerprint text not null check (input_fingerprint ~ '^[a-f0-9]{64}$'),
  source_data jsonb not null check (coalesce(jsonb_typeof(source_data)='object'
    and source_data ?& array['sale','order_lines'] and jsonb_typeof(source_data->'order_lines')='array'
    and source_data->'sale'->>'operation_id'=sale_task_id::text
    and source_data->'sale'->'source'->>'order_id'=order_id
    and source_data->'sale'->'source'->>'payment_id'=payment_id
    and source_data->'sale'->'source'->'input'->>'account_id'=account_id
    and (source_data->'sale'->'source'->'input'->>'livemode')::boolean=livemode
    and octet_length(source_data::text)<=8388608,false)),
  source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  allocation jsonb not null check (coalesce(jsonb_typeof(allocation)='object'
    and allocation ?& array['schema_version','operation_id','order_id','sale_transaction_id','sale_fingerprint','lines','total_cents','refund_shipping','shipping_cents','shipping_tax_cents','fees','fee_decisions']
    and allocation->>'schema_version'='1' and allocation->>'operation_id'=id::text
    and allocation->>'order_id'=order_id and (allocation->>'total_cents')::integer=total_cents
    and jsonb_typeof(allocation->'lines')='array' and jsonb_array_length(allocation->'lines')<=100
    and jsonb_typeof(allocation->'fees')='array' and jsonb_typeof(allocation->'fee_decisions')='array'
    and allocation->'refund_shipping'=input->'refund_shipping'
    and allocation->'fee_decisions'=input->'fee_decisions' and octet_length(allocation::text)<=262144,false)),
  allocation_fingerprint text not null check (allocation_fingerprint ~ '^[a-f0-9]{64}$'),
  request jsonb not null check (coalesce(jsonb_typeof(request)='object'
    and request ?& array['mode','original_transaction','reference','metadata']
    and request->>'mode'='partial' and request->>'original_transaction'=allocation->>'sale_transaction_id'
    and request->>'reference'='snowforce-refund:'||id::text
    and request->'metadata'->>'snowforce_operation'=id::text
    and request->'metadata'->>'snowforce_order'=order_id and octet_length(request::text)<=262144,false)),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  state text not null default 'reserved' check (state in ('reserved','started','cancelled')),
  first_attempt_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text check (cancellation_reason is null or length(btrim(cancellation_reason)) between 5 and 1000),
  created_at timestamptz not null default clock_timestamp(),
  check ((state='reserved' and first_attempt_at is null and cancelled_at is null and cancellation_reason is null)
    or (state='started' and first_attempt_at is not null and cancelled_at is null and cancellation_reason is null)
    or (state='cancelled' and first_attempt_at is null and cancelled_at is not null and cancellation_reason is not null))
);
create index snowforce_refund_allocation_history on commerce.snowforce_refund_allocations(order_id,sequence);
create index snowforce_refund_allocation_case on commerce.snowforce_refund_allocations(case_id,sequence);

create function commerce.guard_refund_allocation() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  request_case commerce.snowforce_after_sales%rowtype;
  native_return commerce."return"%rowtype;
  selected jsonb;
  approved numeric;
  received numeric;
  previous numeric;
  seen text[] := '{}';
begin
  if tg_op='DELETE' then
    raise exception 'Refund reservation audit evidence cannot be deleted' using errcode='23514';
  end if;
  perform 1 from commerce."order" o where o.id=new.order_id and o.deleted_at is null
    and o.status<>'canceled' and o.currency_code='usd' for update;
  if not found then raise exception 'Refund order is unavailable' using errcode='23514'; end if;
  if tg_op='UPDATE' then
    if (to_jsonb(new)-array['state','first_attempt_at','cancelled_at','cancellation_reason'])
      is distinct from (to_jsonb(old)-array['state','first_attempt_at','cancelled_at','cancellation_reason'])
      or old.state<>'reserved' or new.state not in ('started','cancelled') then
      raise exception 'Refund reservation identity, amounts and terminal state are immutable' using errcode='23514';
    end if;
    if new.state='cancelled' then
      if exists(select 1 from commerce.snowforce_refund_allocations a where a.order_id=new.order_id and a.sequence>old.sequence and a.state<>'cancelled') then
        raise exception 'Later refund reservations depend on this rounding position' using errcode='23514';
      end if;
      new.cancelled_at := clock_timestamp();
      return new;
    end if;
    new.first_attempt_at := clock_timestamp();
  elsif new.state<>'reserved' then
    raise exception 'Refund reservations must start untouched' using errcode='23514';
  end if;
  if not exists(select 1 from commerce."user" u where u.id=new.staff_id and u.deleted_at is null) then
    raise exception 'Refund reviewer is unavailable' using errcode='23514';
  end if;
  select * into request_case from commerce.snowforce_after_sales a where a.id=new.case_id for update;
  if not found or request_case.order_id<>new.order_id or request_case.status<>'processing' or request_case.version<>new.case_version then
    raise exception 'Refund review changed' using errcode='23514';
  end if;
  select * into native_return from commerce."return" r where r.id=new.native_return_id for update;
  if not found or native_return.order_id<>new.order_id or native_return.deleted_at is not null or native_return.canceled_at is not null
    or native_return.status='canceled' or native_return.claim_id is not null or native_return.created_at<request_case.created_at
    or (request_case.kind='return' and (request_case.native_id is distinct from native_return.id or native_return.exchange_id is not null))
    or (request_case.kind='exchange' and (request_case.native_id is distinct from native_return.exchange_id or not exists(
      select 1 from commerce.order_exchange e where e.id=request_case.native_id and e.order_id=new.order_id and e.return_id=native_return.id and e.deleted_at is null and e.canceled_at is null))) then
    raise exception 'Refund return does not match the reviewed case' using errcode='23514';
  end if;
  if not exists(select 1 from commerce.snowforce_tax_sale_tasks t join commerce.snowforce_tax_sales s on s.task_id=t.id
    where t.id=new.sale_task_id and t.order_id=new.order_id and t.payment_id=new.payment_id and t.state='ready'
      and s.order_id=new.order_id and s.account_id=new.account_id and s.livemode=new.livemode
      and s.transaction_id=new.allocation->>'sale_transaction_id'
      and t.source=new.source_data->'sale'->'source' and s.snapshot=new.source_data->'sale'->'snapshot') then
    raise exception 'Refund requires the original committed sale' using errcode='23514';
  end if;
  perform 1 from commerce.payment p where p.id=new.payment_id and p.deleted_at is null and p.canceled_at is null
    and p.currency_code='usd' and p.provider_id='pp_stripe_stripe'
    and p.amount*100=(new.source_data->'sale'->'source'->'receipt'->>'total_cents')::numeric
    and p.amount=(p.raw_amount->>'value')::numeric for update;
  if not found or exists(select 1 from commerce.refund r where r.payment_id=new.payment_id and r.deleted_at is null) then
    raise exception 'Native payment or untracked refunds need reconciliation' using errcode='23514';
  end if;
  perform 1 from commerce.return_item i where i.return_id=new.native_return_id and i.deleted_at is null order by i.id for update;
  if not exists(select 1 from commerce.return_item i where i.return_id=new.native_return_id and i.deleted_at is null and i.received_quantity>0) then
    raise exception 'Refund requires received items' using errcode='23514';
  end if;
  for selected in select value from jsonb_array_elements(new.allocation->'lines') loop
    if not coalesce(jsonb_typeof(selected)='object' and selected ?& array['item_id','quantity']
      and jsonb_typeof(selected->'item_id')='string' and selected->>'item_id' ~ '^ordli_[A-Za-z0-9]+$'
      and not (selected->>'item_id'=any(seen)) and jsonb_typeof(selected->'quantity')='number'
      and (selected->>'quantity')::numeric between 1 and 10000 and (selected->>'quantity')::numeric=trunc((selected->>'quantity')::numeric),false) then
      raise exception 'Invalid refund items' using errcode='23514';
    end if;
    seen := array_append(seen,selected->>'item_id');
    select (v->>'quantity')::numeric into approved from jsonb_array_elements(request_case.items) v where v->>'id'=selected->>'item_id';
    select i.received_quantity into received from commerce.return_item i where i.return_id=new.native_return_id and i.item_id=selected->>'item_id'
      and i.deleted_at is null and i.quantity=approved and i.quantity=(i.raw_quantity->>'value')::numeric
      and i.received_quantity=(i.raw_received_quantity->>'value')::numeric and i.received_quantity<=i.quantity;
    select coalesce(sum((v->>'quantity')::numeric),0) into previous from commerce.snowforce_refund_allocations a,
      lateral jsonb_array_elements(a.allocation->'lines') v
      where a.order_id=new.order_id and a.id<>new.id and a.state<>'cancelled'
        and (a.case_id=new.case_id or a.native_return_id=new.native_return_id) and v->>'item_id'=selected->>'item_id';
    if approved is null or received is null or received<previous+(selected->>'quantity')::numeric then
      raise exception 'Refund quantity exceeds reviewed receipt' using errcode='23514';
    end if;
  end loop;
  return new;
end $$;
create trigger guard_snowforce_refund_allocations before insert or update or delete on commerce.snowforce_refund_allocations
  for each row execute function commerce.guard_refund_allocation();
alter table commerce.snowforce_refund_allocations owner to snowforce_commerce;
alter sequence commerce.snowforce_refund_allocations_sequence_seq owner to snowforce_commerce;
alter function commerce.guard_refund_allocation() owner to snowforce_commerce;
alter table commerce.snowforce_refund_allocations enable row level security;
revoke all on table commerce.snowforce_refund_allocations from public,anon,authenticated,service_role;
revoke all on sequence commerce.snowforce_refund_allocations_sequence_seq from public,anon,authenticated,service_role;
revoke all on function commerce.guard_refund_allocation() from public,anon,authenticated,service_role;
grant select,insert,update on table commerce.snowforce_refund_allocations to snowforce_commerce;
grant usage,select on sequence commerce.snowforce_refund_allocations_sequence_seq to snowforce_commerce;
grant execute on function commerce.guard_refund_allocation() to snowforce_commerce;
comment on table commerce.snowforce_refund_allocations is 'Private original-sale refund reservations. Financial provider/outbox integration must be verified before exposing execution.';
