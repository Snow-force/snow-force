-- Verified continuation only. This migration neither registers a payment
-- provider nor enables an execution route or sales mode.
create function commerce.assert_completed_refunds(p_payment text,p_order text,p_sale jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare current_refund commerce.refund%rowtype;
begin
  perform 1 from commerce.payment p where p.id=p_payment and p.deleted_at is null and p.canceled_at is null
    and p.provider_id='pp_stripe_stripe' and p.currency_code='usd'
    and p.amount*100=(p_sale->'source'->'receipt'->>'total_cents')::numeric and p.amount=(p.raw_amount->>'value')::numeric for update;
  if not found then raise exception 'Refund payment changed' using errcode='23514'; end if;
  if exists(select 1 from commerce.snowforce_refund_funds f where f.payment_id=p_payment and not exists(
    select 1 from commerce.refund r where r.id=f.native_refund_id and r.payment_id=p_payment and r.deleted_at is null)) then
    raise exception 'Refund evidence has no current native record' using errcode='23514';
  end if;
  for current_refund in select * from commerce.refund r where r.payment_id=p_payment and r.deleted_at is null order by r.id for update loop
    if not exists(select 1 from commerce.snowforce_refund_funds f
      join commerce.snowforce_refund_allocations a on a.id=f.allocation_id
      join commerce.snowforce_refund_executions e on e.id=a.id
      join commerce.snowforce_refund_tax_tasks t on t.id=a.id
      join commerce.snowforce_refund_tax_results result on result.task_id=t.id
      join commerce.payment p on p.id=f.payment_id
      where f.native_refund_id=current_refund.id and f.payment_id=p_payment and a.payment_id=p_payment and a.order_id=p_order
        and a.state='started' and a.source_data->'sale'=p_sale
        and f.account_id=a.account_id and f.livemode=a.livemode and f.total_cents=a.total_cents
        and current_refund.amount*100=f.total_cents and current_refund.amount=(current_refund.raw_amount->>'value')::numeric
        and current_refund.created_by=a.staff_id and floor(extract(epoch from current_refund.created_at))=(f.snapshot->'native'->>'created_at')::numeric
        and current_refund.created_at>=a.first_attempt_at
        and current_refund.metadata->'snowforce_refund'->>'operation_id'=a.id::text
        and current_refund.metadata->'snowforce_refund'->>'allocation_fingerprint'=a.allocation_fingerprint
        and p.data->>'id'=p_sale->'source'->>'intent_id' and (p.data->>'livemode')::boolean=a.livemode
        and p.payment_session_id=p_sale->'source'->>'session_id'
        and (select count(*) from commerce.capture c where c.payment_id=p.id and c.deleted_at is null)=1
        and exists(select 1 from commerce.capture c where c.payment_id=p.id and c.deleted_at is null
          and c.id=p_sale->'source'->>'capture_id' and floor(extract(epoch from c.created_at))=(p_sale->'source'->>'captured_at')::numeric
          and c.amount=p.amount and c.amount=(c.raw_amount->>'value')::numeric)
        and e.state='ready' and e.remote_id=f.stripe_refund_id and e.snapshot=f.snapshot->'refund'
        and e.request=jsonb_build_object('payment_intent',p_sale->'source'->>'intent_id','amount',a.total_cents,'currency','usd',
          'metadata',jsonb_build_object('snowforce_operation',a.id::text,'snowforce_allocation',a.allocation_fingerprint,'snowforce_order',a.order_id,'snowforce_payment',a.payment_id))
        and t.state='ready' and t.remote_id=result.transaction_id and t.funds_fingerprint=f.fingerprint
        and t.allocation_fingerprint=a.allocation_fingerprint and t.request_fingerprint=a.request_fingerprint
        and result.account_id=a.account_id and result.livemode=a.livemode
        and result.snapshot->'transaction'->>'id'=result.transaction_id
        and result.snapshot->'transaction'->'reversal'->>'original_transaction'=a.allocation->>'sale_transaction_id'
        and (result.snapshot->>'total_cents')::numeric=f.total_cents
        and (select count(*) from commerce.order_transaction ot where ot.order_id=a.order_id and ot.reference='refund'
          and ot.reference_id=current_refund.id and ot.deleted_at is null)=1
        and exists(select 1 from commerce.order_transaction ot where ot.order_id=a.order_id and ot.reference='refund'
          and ot.reference_id=current_refund.id and ot.deleted_at is null and ot.currency_code='usd'
          and ot.amount*100=-f.total_cents and ot.amount=(ot.raw_amount->>'value')::numeric)) then
      raise exception 'Prior refund needs completed individual cash, tax and order proof' using errcode='23514';
    end if;
  end loop;
  if (select coalesce(sum(r.amount*100),0) from commerce.refund r where r.payment_id=p_payment and r.deleted_at is null)
    is distinct from (select coalesce(sum(f.total_cents),0) from commerce.snowforce_refund_funds f where f.payment_id=p_payment)
    or (select coalesce(sum(f.total_cents),0) from commerce.snowforce_refund_funds f where f.payment_id=p_payment)>(p_sale->'source'->'receipt'->>'total_cents')::numeric then
    raise exception 'Refund balance is inconsistent' using errcode='23514';
  end if;
end $$;
alter function commerce.assert_completed_refunds(text,text,jsonb) owner to snowforce_commerce;
revoke all on function commerce.assert_completed_refunds(text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function commerce.assert_completed_refunds(text,text,jsonb) to snowforce_commerce;

create or replace function commerce.guard_refund_allocation() returns trigger
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
  if not found then
    raise exception 'Native payment or untracked refunds need reconciliation' using errcode='23514';
  end if;
  perform commerce.assert_completed_refunds(new.payment_id,new.order_id,new.source_data->'sale');
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

alter function commerce.guard_refund_allocation() owner to snowforce_commerce;
