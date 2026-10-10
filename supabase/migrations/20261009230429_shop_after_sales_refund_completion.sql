-- Closing a case verifies existing money/tax evidence only. No payment provider
-- registration, funds call, new public privilege or sales-mode change.
create function commerce.guard_after_sales_refund_completion() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  returned commerce."return"%rowtype;
  verification commerce.snowforce_refund_verifications%rowtype;
  native_payment commerce.payment%rowtype;
  expected_return text;
  payment_check jsonb;
  raw_sale jsonb;
  line jsonb;
  allocated numeric;
begin
  if new.status<>'completed' or old.status='completed' then return new; end if;
  if old.status<>'processing' or old.native_id is null then
    raise exception 'Only a linked processing request can complete' using errcode='23514';
  end if;
  perform 1 from commerce."order" o where o.id=old.order_id and o.deleted_at is null
    and o.status<>'canceled' and o.currency_code='usd' for update;
  if not found then raise exception 'Completion order is unavailable' using errcode='23514'; end if;
  perform p.id from commerce.payment p join commerce.order_payment_collection l on l.payment_collection_id=p.payment_collection_id
    where l.order_id=old.order_id and l.deleted_at is null and p.deleted_at is null order by p.id for update of p;
  if old.kind='return' then expected_return:=old.native_id;
  else
    select e.return_id into expected_return from commerce.order_exchange e where e.id=old.native_id and e.order_id=old.order_id
      and e.deleted_at is null and e.canceled_at is null for update;
  end if;
  select * into returned from commerce."return" r where r.id=expected_return for update;
  if not found or returned.order_id<>old.order_id or returned.deleted_at is not null or returned.canceled_at is not null
    or returned.status<>'received' or returned.claim_id is not null or returned.created_at<old.created_at
    or (old.kind='return' and returned.exchange_id is not null)
    or (old.kind='exchange' and returned.exchange_id is distinct from old.native_id) then
    raise exception 'Completion requires the matching fully received native return' using errcode='23514';
  end if;
  perform ri.id from commerce.return_item ri where ri.return_id=returned.id and ri.deleted_at is null order by ri.id for update;
  if (select count(*) from commerce.return_item ri where ri.return_id=returned.id and ri.deleted_at is null)<>jsonb_array_length(old.items)
    or (select count(distinct value->>'id') from jsonb_array_elements(old.items))<>jsonb_array_length(old.items) then
    raise exception 'Completion receipt items changed' using errcode='23514';
  end if;
  for line in select value from jsonb_array_elements(old.items) loop
    if not exists(select 1 from commerce.return_item ri where ri.return_id=returned.id and ri.deleted_at is null
      and ri.item_id=line->>'id' and ri.quantity=(line->>'quantity')::numeric
      and ri.quantity=(ri.raw_quantity->>'value')::numeric and ri.received_quantity=ri.quantity
      and ri.received_quantity=(ri.raw_received_quantity->>'value')::numeric) then
      raise exception 'Completion requires every approved unit received exactly' using errcode='23514';
    end if;
  end loop;
  if old.kind='exchange' and (not exists(select 1 from commerce.order_exchange_item ei where ei.exchange_id=old.native_id and ei.deleted_at is null)
    or exists(select 1 from commerce.order_exchange_item ei where ei.exchange_id=old.native_id and ei.deleted_at is null and not exists(
      select 1 from commerce.order_item oi join commerce."order" o on o.id=oi.order_id where oi.order_id=old.order_id and oi.version=o.version
        and oi.item_id=ei.item_id and oi.deleted_at is null and ei.quantity>0 and ei.quantity=(ei.raw_quantity->>'value')::numeric
        and oi.delivered_quantity>=ei.quantity and oi.delivered_quantity=(oi.raw_delivered_quantity->>'value')::numeric))) then
    raise exception 'Completion requires replacement delivery' using errcode='23514';
  end if;
  select * into verification from commerce.snowforce_refund_verifications v where v.order_id=old.order_id for update;
  if not found or verification.state<>'verified' or verification.observed_at<clock_timestamp()-interval '120 seconds'
    or verification.observed_at>clock_timestamp()+interval '1 second'
    or verification.audit->>'source' is distinct from 'staff' or verification.audit->>'request_id' is distinct from old.id::text
    or not exists(select 1 from commerce."user" u where u.id=verification.audit->>'staff_id' and u.deleted_at is null) then
    raise exception 'Completion needs a fresh staff Stripe reconciliation for this request' using errcode='23514';
  end if;
  if jsonb_array_length(verification.snapshot->'payments')<>(select count(*) from commerce.payment p
    join commerce.order_payment_collection l on l.payment_collection_id=p.payment_collection_id
    where l.order_id=old.order_id and l.deleted_at is null and p.deleted_at is null and p.amount>0) then
    raise exception 'Completion payment set changed' using errcode='23514';
  end if;
  for native_payment in select p.* from commerce.payment p join commerce.order_payment_collection l on l.payment_collection_id=p.payment_collection_id
    where l.order_id=old.order_id and l.deleted_at is null and p.deleted_at is null loop
    if native_payment.amount=0 and not exists(select 1 from commerce.capture c where c.payment_id=native_payment.id and c.deleted_at is null)
      and not exists(select 1 from commerce.refund r where r.payment_id=native_payment.id and r.deleted_at is null) then continue; end if;
    if (select count(*) from jsonb_array_elements(verification.snapshot->'payments') v where v->>'payment_id'=native_payment.id)<>1 then
      raise exception 'Completion payment observation missing or duplicated' using errcode='23514';
    end if;
    select value into payment_check from jsonb_array_elements(verification.snapshot->'payments') where value->>'payment_id'=native_payment.id;
    if jsonb_typeof(payment_check->'native_refunds') is distinct from 'array' or jsonb_typeof(payment_check->'refunds') is distinct from 'array'
      or native_payment.provider_id<>'pp_stripe_stripe' or native_payment.currency_code<>'usd' or native_payment.canceled_at is not null
      or native_payment.amount is distinct from (native_payment.raw_amount->>'value')::numeric
      or payment_check->>'state' is distinct from 'verified' or payment_check->>'intent_id' is distinct from native_payment.data->>'id'
      or (payment_check->>'livemode')::boolean is distinct from (native_payment.data->>'livemode')::boolean
      or (payment_check->>'captured_cents')::numeric is distinct from native_payment.amount*100
      or (select coalesce(sum(c.amount*100),0) from commerce.capture c where c.payment_id=native_payment.id and c.deleted_at is null) is distinct from native_payment.amount*100
      or exists(select 1 from commerce.capture c where c.payment_id=native_payment.id and c.deleted_at is null
        and (c.amount<=0 or c.amount is distinct from (c.raw_amount->>'value')::numeric))
      or (payment_check->>'expected_refund_cents')::numeric is distinct from (select coalesce(sum(r.amount*100),0) from commerce.refund r where r.payment_id=native_payment.id and r.deleted_at is null)
      or (payment_check->>'succeeded_refund_cents')::numeric is distinct from (payment_check->>'expected_refund_cents')::numeric
      or jsonb_array_length(payment_check->'native_refunds')<>(select count(*) from commerce.refund r where r.payment_id=native_payment.id and r.deleted_at is null)
      or exists(select 1 from commerce.refund r where r.payment_id=native_payment.id and r.deleted_at is null and not exists(
        select 1 from jsonb_array_elements(payment_check->'native_refunds') v where v->>'id'=r.id and (v->>'amount_cents')::numeric=r.amount*100)) then
      raise exception 'Completion payment or native refunds changed' using errcode='23514';
    end if;
  end loop;
  select a.source_data->'sale' into raw_sale from commerce.snowforce_refund_allocations a
    where a.order_id=old.order_id and a.state<>'cancelled' order by a.sequence limit 1;
  if not found then
    if old.kind<>'exchange' or exists(select 1 from commerce.refund r join commerce.payment p on p.id=r.payment_id
      join commerce.order_payment_collection l on l.payment_collection_id=p.payment_collection_id
      where l.order_id=old.order_id and l.deleted_at is null and p.deleted_at is null and r.deleted_at is null)
      or exists(select 1 from commerce.snowforce_refund_funds f join commerce.snowforce_refund_allocations a on a.id=f.allocation_id where a.order_id=old.order_id)
      or exists(select 1 from jsonb_array_elements(verification.snapshot->'payments') p where jsonb_array_length(p->'refunds')<>0) then
      raise exception 'Completion requires individual refund allocations' using errcode='23514';
    end if;
    return new;
  end if;
  if jsonb_array_length(verification.snapshot->'payments')<>1 or not exists(select 1 from jsonb_array_elements(verification.snapshot->'payments') p
    where p->>'payment_id'=raw_sale->'source'->>'payment_id')
    or exists(select 1 from commerce.snowforce_refund_allocations a where a.order_id=old.order_id and a.state<>'cancelled'
      and (a.state<>'started' or a.source_data->'sale' is distinct from raw_sale or not exists(select 1 from commerce.snowforce_refund_funds f where f.allocation_id=a.id))) then
    raise exception 'Completion contains unfinished or unrelated refund plans' using errcode='23514';
  end if;
  perform commerce.assert_completed_refunds(raw_sale->'source'->>'payment_id',old.order_id,raw_sale);
  select value into payment_check from jsonb_array_elements(verification.snapshot->'payments');
  if jsonb_array_length(payment_check->'refunds')<>(select count(*) from commerce.snowforce_refund_funds f where f.payment_id=raw_sale->'source'->>'payment_id')
    or exists(select 1 from commerce.snowforce_refund_funds f where f.payment_id=raw_sale->'source'->>'payment_id' and not exists(
      select 1 from jsonb_array_elements(payment_check->'refunds') r where r->>'id'=f.stripe_refund_id and r->>'status'='succeeded'
        and (r->>'amount_cents')::numeric=f.total_cents))
    or exists(select 1 from commerce.snowforce_refund_allocations a where a.case_id=old.id and a.state<>'cancelled'
      and (a.native_return_id is distinct from returned.id or a.case_version>old.version or exists(
        select 1 from jsonb_array_elements(a.allocation->'lines') l where not exists(select 1 from jsonb_array_elements(old.items) i where i->>'id'=l->>'item_id')))) then
    raise exception 'Completion requires matching individual provider refunds and case association' using errcode='23514';
  end if;
  for line in select value from jsonb_array_elements(old.items) loop
    select coalesce(sum((l->>'quantity')::numeric),0) into allocated from commerce.snowforce_refund_allocations a,
      lateral jsonb_array_elements(a.allocation->'lines') l where a.case_id=old.id and a.state<>'cancelled' and l->>'item_id'=line->>'id';
    if allocated>(line->>'quantity')::numeric or (old.kind='return' and allocated<>(line->>'quantity')::numeric) then
      raise exception 'Completion requires refund coverage of every returned unit' using errcode='23514';
    end if;
  end loop;
  return new;
end $$;
create trigger guard_snowforce_after_sales_completion before update of status on commerce.snowforce_after_sales
  for each row execute function commerce.guard_after_sales_refund_completion();
alter function commerce.guard_after_sales_refund_completion() owner to snowforce_commerce;
revoke all on function commerce.guard_after_sales_refund_completion() from public,anon,authenticated,service_role;
grant execute on function commerce.guard_after_sales_refund_completion() to snowforce_commerce;
