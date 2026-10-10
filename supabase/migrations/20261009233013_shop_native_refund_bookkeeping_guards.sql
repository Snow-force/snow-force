-- Native bookkeeping safety only. Applying this migration does not register
-- a provider, execute funds, expose an API or enable sales.
-- Existing duplicates cause installation to fail for explicit reconciliation;
-- historical records are never rewritten or deleted here.
create unique index snowforce_native_refund_operation on commerce.refund
  ((metadata->'snowforce_refund'->>'operation_id'))
  where deleted_at is null and metadata ? 'snowforce_refund';
create unique index snowforce_native_refund_order_debit on commerce.order_transaction(reference_id)
  where deleted_at is null and reference='refund' and reference_id ~ '^ref_[A-Za-z0-9]+$';

create function commerce.guard_native_snowforce_refund() returns trigger
language plpgsql security invoker set search_path='' as $$
declare a commerce.snowforce_refund_allocations%rowtype;
begin
  if tg_op<>'INSERT' and old.metadata ? 'snowforce_refund' then
    if tg_op='DELETE' or (new.deleted_at is not null and old.deleted_at is null) then
      if exists(select 1 from commerce.snowforce_refund_funds f where f.native_refund_id=old.id)
        or exists(select 1 from commerce.order_transaction t where t.reference='refund' and t.reference_id=old.id and t.deleted_at is null) then
        raise exception 'Bookkept refund evidence cannot be removed' using errcode='23514';
      end if;
      if tg_op='DELETE' then return old; end if;
    end if;
    if (new.id,new.payment_id,new.amount,new.raw_amount,new.created_by,new.created_at,new.metadata#-'{snowforce_refund,claim_token}')
      is distinct from (old.id,old.payment_id,old.amount,old.raw_amount,old.created_by,old.created_at,old.metadata#-'{snowforce_refund,claim_token}') then
      raise exception 'Refund bookkeeping identity and original amounts are immutable' using errcode='23514';
    end if;
  elsif tg_op='DELETE' then return old;
  end if;
  if not coalesce(new.metadata ? 'snowforce_refund',false) then return new; end if;
  select * into a from commerce.snowforce_refund_allocations where id::text=new.metadata->'snowforce_refund'->>'operation_id';
  if not found or jsonb_typeof(new.metadata->'snowforce_refund') is distinct from 'object' or a.state<>'started'
    or new.payment_id is distinct from a.payment_id or new.created_by is distinct from a.staff_id
    or new.amount*100 is distinct from a.total_cents::numeric or new.amount is distinct from (new.raw_amount->>'value')::numeric
    or new.created_at<a.first_attempt_at or new.metadata->'snowforce_refund'->>'allocation_fingerprint' is distinct from a.allocation_fingerprint
    or not exists(select 1 from commerce.payment p where p.id=a.payment_id and p.deleted_at is null and p.canceled_at is null
      and p.currency_code='usd' and p.provider_id='pp_stripe_stripe' and p.amount=(p.raw_amount->>'value')::numeric
      and p.amount*100=(a.source_data->'sale'->'source'->'receipt'->>'total_cents')::numeric
      and p.data->>'id'=a.source_data->'sale'->'source'->>'intent_id'
      and (p.data->>'livemode')::boolean=a.livemode) then
    raise exception 'Native refund must match its exact started allocation and payment' using errcode='23514';
  end if;
  return new;
end $$;
create trigger guard_snowforce_native_refund before insert or update or delete on commerce.refund
  for each row execute function commerce.guard_native_snowforce_refund();

create function commerce.guard_native_snowforce_refund_transaction() returns trigger
language plpgsql security invoker set search_path='' as $$
declare r commerce.refund%rowtype; a commerce.snowforce_refund_allocations%rowtype;
begin
  if tg_op<>'INSERT' and old.reference='refund' and exists(select 1 from commerce.refund old_r
    where old_r.id=old.reference_id and old_r.metadata ? 'snowforce_refund') then
    if exists(select 1 from commerce.snowforce_refund_funds f where f.native_refund_id=old.reference_id) then
      if tg_op='DELETE' or (new.id,new.order_id,new.reference,new.reference_id,new.currency_code,new.amount,new.raw_amount,new.deleted_at)
        is distinct from (old.id,old.order_id,old.reference,old.reference_id,old.currency_code,old.amount,old.raw_amount,old.deleted_at) then
        raise exception 'Settled native refund debit cannot be changed or removed' using errcode='23514';
      end if;
      return new;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  if new.reference<>'refund' or new.deleted_at is not null then return new; end if;
  select * into r from commerce.refund where id=new.reference_id and metadata ? 'snowforce_refund' for update;
  if not found then return new; end if;
  select * into a from commerce.snowforce_refund_allocations where id::text=r.metadata->'snowforce_refund'->>'operation_id';
  if not found or r.deleted_at is not null or r.payment_id<>a.payment_id or r.amount*100<>a.total_cents
    or r.amount is distinct from (r.raw_amount->>'value')::numeric or new.order_id is distinct from a.order_id
    or new.currency_code is distinct from 'usd' or new.amount*100 is distinct from -a.total_cents::numeric
    or new.amount is distinct from (new.raw_amount->>'value')::numeric
    or not exists(select 1 from commerce.snowforce_refund_executions e where e.id=a.id and e.state='running'
      and e.lease_until>clock_timestamp() and e.snapshot->>'status'='succeeded' and (e.snapshot->>'amount')::numeric=a.total_cents) then
    raise exception 'Order refund debit requires exact native cents and a successful active execution' using errcode='23514';
  end if;
  return new;
end $$;
create trigger guard_snowforce_native_refund_transaction before insert or update or delete on commerce.order_transaction
  for each row execute function commerce.guard_native_snowforce_refund_transaction();
alter function commerce.guard_native_snowforce_refund() owner to snowforce_commerce;
alter function commerce.guard_native_snowforce_refund_transaction() owner to snowforce_commerce;
revoke all on function commerce.guard_native_snowforce_refund(),commerce.guard_native_snowforce_refund_transaction() from public,anon,authenticated,service_role;
grant execute on function commerce.guard_native_snowforce_refund(),commerce.guard_native_snowforce_refund_transaction() to snowforce_commerce;
