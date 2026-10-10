-- Candidate execution ledger only. No payment provider is replaced, and no
-- production refund engine is enabled by applying this migration.
create table commerce.snowforce_refund_executions (
  id uuid primary key references commerce.snowforce_refund_allocations(id),
  payment_id text not null references commerce.payment(id),
  request jsonb not null check(jsonb_typeof(request)='object' and octet_length(request::text)<=16384),
  request_fingerprint text not null check(request_fingerprint ~ '^[a-f0-9]{64}$'),
  state text not null default 'queued' check(state in ('queued','running','retry','pending','reconcile_required','ready')),
  remote_id text unique check(remote_id ~ '^re_[A-Za-z0-9]+$'),
  snapshot jsonb check(snapshot is null or (jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=65536)),
  attempts integer not null default 0 check(attempts>=0),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default clock_timestamp(),
  claim_token uuid,
  lease_until timestamptz,
  error_code text check(error_code in ('refund_not_succeeded','evidence_changed','provider_unavailable')),
  created_at timestamptz not null default clock_timestamp(),
  check((state='running' and claim_token is not null and lease_until is not null and first_attempt_at is not null and attempts>0)
    or (state<>'running' and claim_token is null and lease_until is null)),
  check((remote_id is null and snapshot is null) or (remote_id is not null and snapshot is not null and snapshot->>'id'=remote_id))
);
create index snowforce_refund_execution_due on commerce.snowforce_refund_executions(next_attempt_at) where state in ('queued','retry','pending');
create table commerce.snowforce_refund_execution_history (
  sequence bigint generated always as identity primary key,
  execution_id uuid not null references commerce.snowforce_refund_executions(id),
  state text not null, remote_id text, refund_status text,
  attempts integer not null, claim_token uuid, error_code text,
  observed_at timestamptz not null default clock_timestamp()
);
create function commerce.guard_refund_execution() returns trigger
language plpgsql security invoker set search_path='' as $$
declare a commerce.snowforce_refund_allocations%rowtype;
begin
  if tg_op='DELETE' then raise exception 'Refund execution audit cannot be deleted' using errcode='23514'; end if;
  select * into a from commerce.snowforce_refund_allocations where id=new.id for share;
  if not found or a.state<>'started' or a.payment_id<>new.payment_id
    or new.request<>jsonb_build_object('payment_intent',a.source_data->'sale'->'source'->>'intent_id','amount',a.total_cents,'currency','usd',
      'metadata',jsonb_build_object('snowforce_operation',a.id::text,'snowforce_allocation',a.allocation_fingerprint,'snowforce_order',a.order_id,'snowforce_payment',a.payment_id)) then
    raise exception 'Refund execution must use its exact started allocation' using errcode='23514';
  end if;
  if tg_op='INSERT' then
    if new.state<>'queued' or new.remote_id is not null or new.first_attempt_at is not null or new.attempts<>0 then
      raise exception 'Refund execution starts untouched' using errcode='23514';
    end if;
  else
    if (to_jsonb(new)-array['state','remote_id','snapshot','attempts','first_attempt_at','next_attempt_at','claim_token','lease_until','error_code'])
      is distinct from (to_jsonb(old)-array['state','remote_id','snapshot','attempts','first_attempt_at','next_attempt_at','claim_token','lease_until','error_code'])
      or old.state='ready' or new.attempts<old.attempts
      or (old.first_attempt_at is not null and old.first_attempt_at is distinct from new.first_attempt_at)
      or (old.remote_id is not null and old.remote_id is distinct from new.remote_id) then
      raise exception 'Refund identity, original request and completed state are immutable' using errcode='23514';
    end if;
  end if;
  if new.snapshot is not null and not coalesce(new.snapshot->>'object'='refund' and new.snapshot->>'currency'='usd'
    and (new.snapshot->>'amount')::numeric=a.total_cents and new.snapshot->>'payment_intent'=new.request->>'payment_intent'
    and new.snapshot->'metadata'=new.request->'metadata'
    and new.snapshot->>'status' in ('pending','requires_action','succeeded','failed','canceled')
    and (new.snapshot->>'created')::numeric>=floor(extract(epoch from a.first_attempt_at)),false) then
    raise exception 'Stripe refund must match this reviewed execution' using errcode='23514';
  end if;
  if new.state='ready' and not exists(select 1 from commerce.snowforce_refund_funds f
    join commerce.order_transaction t on t.reference='refund' and t.reference_id=f.native_refund_id and t.order_id=a.order_id and t.deleted_at is null
    where f.allocation_id=a.id and f.stripe_refund_id=new.remote_id and f.total_cents=a.total_cents and new.snapshot->>'status'='succeeded'
      and t.currency_code='usd' and t.amount*100=-a.total_cents and t.amount=(t.raw_amount->>'value')::numeric) then
    raise exception 'Refund completion needs successful funds and correct native bookkeeping' using errcode='23514';
  end if;
  return new;
end $$;
create function commerce.audit_refund_execution() returns trigger
language plpgsql security invoker set search_path='' as $$ begin
  insert into commerce.snowforce_refund_execution_history(execution_id,state,remote_id,refund_status,attempts,claim_token,error_code)
    values(new.id,new.state,new.remote_id,new.snapshot->>'status',new.attempts,new.claim_token,new.error_code);
  return new;
end $$;
create function commerce.guard_refund_execution_history() returns trigger
language plpgsql security invoker set search_path='' as $$ begin
  if tg_op<>'INSERT' or pg_trigger_depth()<2 then raise exception 'Refund history is append-only from its ledger trigger' using errcode='23514'; end if;
  return new;
end $$;
create trigger guard_snowforce_refund_execution before insert or update or delete on commerce.snowforce_refund_executions for each row execute function commerce.guard_refund_execution();
create trigger audit_snowforce_refund_execution after insert or update on commerce.snowforce_refund_executions for each row execute function commerce.audit_refund_execution();
create trigger guard_snowforce_refund_execution_history before insert or update or delete on commerce.snowforce_refund_execution_history for each row execute function commerce.guard_refund_execution_history();
alter table commerce.snowforce_refund_executions owner to snowforce_commerce;
alter table commerce.snowforce_refund_execution_history owner to snowforce_commerce;
alter sequence commerce.snowforce_refund_execution_history_sequence_seq owner to snowforce_commerce;
alter table commerce.snowforce_refund_executions enable row level security;
alter table commerce.snowforce_refund_execution_history enable row level security;
alter function commerce.guard_refund_execution() owner to snowforce_commerce;
alter function commerce.audit_refund_execution() owner to snowforce_commerce;
alter function commerce.guard_refund_execution_history() owner to snowforce_commerce;
revoke all on commerce.snowforce_refund_executions,commerce.snowforce_refund_execution_history from public,anon,authenticated,service_role;
revoke all on sequence commerce.snowforce_refund_execution_history_sequence_seq from public,anon,authenticated,service_role;
revoke all on function commerce.guard_refund_execution(),commerce.audit_refund_execution(),commerce.guard_refund_execution_history() from public,anon,authenticated,service_role;
grant select,insert,update on commerce.snowforce_refund_executions to snowforce_commerce;
grant select,insert on commerce.snowforce_refund_execution_history to snowforce_commerce;
grant usage,select on sequence commerce.snowforce_refund_execution_history_sequence_seq to snowforce_commerce;
grant execute on function commerce.guard_refund_execution(),commerce.audit_refund_execution(),commerce.guard_refund_execution_history() to snowforce_commerce;
