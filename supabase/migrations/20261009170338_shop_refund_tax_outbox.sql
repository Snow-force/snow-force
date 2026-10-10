-- Funds evidence and tax reversals are separate from customer refund execution.
-- No live provider call or production payment is initiated by this migration.
create table commerce.snowforce_refund_funds (
  allocation_id uuid primary key references commerce.snowforce_refund_allocations(id),
  native_refund_id text not null unique references commerce.refund(id),
  stripe_refund_id text not null check (stripe_refund_id ~ '^re_[A-Za-z0-9]+$'),
  account_id text not null check (account_id ~ '^acct_[A-Za-z0-9]+$'),
  livemode boolean not null,
  payment_id text not null references commerce.payment(id),
  total_cents integer not null check (total_cents between 1 and 99999999),
  snapshot jsonb not null check (coalesce(jsonb_typeof(snapshot)='object'
    and snapshot ?& array['schema_version','operation_id','native_refund_id','stripe_refund_id','account_id','livemode','payment_id','intent_id','total_cents','native','refund','observed_at']
    and snapshot->>'schema_version'='1' and snapshot->>'operation_id'=allocation_id::text
    and snapshot->>'native_refund_id'=native_refund_id and snapshot->>'stripe_refund_id'=stripe_refund_id
    and snapshot->>'payment_id'=payment_id and snapshot->>'account_id'=account_id and (snapshot->>'livemode')::boolean=livemode
    and (snapshot->>'total_cents')::integer=total_cents and (snapshot->'native'->>'amount')::integer=total_cents
    and snapshot->'native'->>'id'=native_refund_id and snapshot->'refund'->>'id'=stripe_refund_id
    and snapshot->'refund'->>'object'='refund' and snapshot->'refund'->>'status'='succeeded'
    and snapshot->'refund'->>'currency'='usd' and (snapshot->'refund'->>'amount')::integer=total_cents
    and snapshot->'refund'->>'payment_intent'=snapshot->>'intent_id'
    and snapshot->'refund'->'metadata'->>'snowforce_operation'=allocation_id::text
    and octet_length(snapshot::text)<=65536,false)),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique(account_id,livemode,stripe_refund_id)
);
create table commerce.snowforce_refund_tax_tasks (
  id uuid primary key references commerce.snowforce_refund_funds(allocation_id),
  allocation_fingerprint text not null check (allocation_fingerprint ~ '^[a-f0-9]{64}$'),
  funds_fingerprint text not null check (funds_fingerprint ~ '^[a-f0-9]{64}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  state text not null default 'queued' check (state in ('queued','running','retry','reconcile_required','ready')),
  remote_id text check (remote_id ~ '^tax_[A-Za-z0-9]+$'),
  attempts integer not null default 0 check (attempts>=0),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default clock_timestamp(),
  claim_token uuid,
  lease_until timestamptz,
  error_code text check (error_code in ('provider_unavailable','funds_changed','request_aged','reversal_mismatch')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((state='running' and claim_token is not null and lease_until is not null and first_attempt_at is not null and attempts>0)
    or (state<>'running' and claim_token is null and lease_until is null)),
  check (state<>'ready' or (remote_id is not null and error_code is null))
);
create index snowforce_refund_tax_due on commerce.snowforce_refund_tax_tasks(next_attempt_at,created_at,id) where state in ('queued','retry');
create index snowforce_refund_tax_lease on commerce.snowforce_refund_tax_tasks(lease_until) where state='running';
create table commerce.snowforce_refund_tax_results (
  task_id uuid primary key references commerce.snowforce_refund_tax_tasks(id),
  account_id text not null check (account_id ~ '^acct_[A-Za-z0-9]+$'),
  livemode boolean not null,
  transaction_id text not null check (transaction_id ~ '^tax_[A-Za-z0-9]+$'),
  snapshot jsonb not null check (coalesce(jsonb_typeof(snapshot)='object'
    and snapshot ?& array['schema_version','transaction','lines','total_cents'] and snapshot->>'schema_version'='1'
    and snapshot->'transaction'->>'id'=transaction_id and snapshot->'transaction'->>'type'='reversal'
    and snapshot->'transaction'->>'currency'='usd' and (snapshot->'transaction'->>'livemode')::boolean=livemode
    and snapshot->'transaction'->>'reference'='snowforce-refund:'||task_id::text
    and jsonb_typeof(snapshot->'lines')='array' and octet_length(snapshot::text)<=262144,false)),
  resolution jsonb check (resolution is null or jsonb_typeof(resolution) in ('object','null')),
  created_at timestamptz not null default clock_timestamp(),
  unique(account_id,livemode,transaction_id)
);
create function commerce.guard_refund_tax_ledger() returns trigger
language plpgsql security invoker set search_path='' as $$
declare allocation commerce.snowforce_refund_allocations%rowtype;
begin
  if tg_op='DELETE' or (tg_op='UPDATE' and tg_table_name<>'snowforce_refund_tax_tasks') then
    raise exception 'Refund funds and tax result evidence is immutable' using errcode='23514';
  end if;
  if tg_table_name='snowforce_refund_funds' then
    select * into allocation from commerce.snowforce_refund_allocations a where a.id=new.allocation_id for share;
    if not found or allocation.state<>'started' or allocation.first_attempt_at is null
      or allocation.payment_id<>new.payment_id or allocation.total_cents<>new.total_cents or allocation.account_id<>new.account_id or allocation.livemode<>new.livemode
      or new.snapshot->>'intent_id'<>allocation.source_data->'sale'->'source'->>'intent_id'
      or new.snapshot->'refund'->'metadata'->>'snowforce_allocation' is distinct from allocation.allocation_fingerprint
      or new.snapshot->'refund'->'metadata'->>'snowforce_order' is distinct from allocation.order_id
      or new.snapshot->'refund'->'metadata'->>'snowforce_payment' is distinct from allocation.payment_id
      or (new.snapshot->'refund'->>'created')::numeric<floor(extract(epoch from allocation.first_attempt_at))
      or (new.snapshot->>'observed_at')::numeric>extract(epoch from clock_timestamp())
      or (new.snapshot->>'observed_at')::numeric<extract(epoch from clock_timestamp())-120 then
      raise exception 'Refund funds must match a fresh verified started allocation' using errcode='23514';
    end if;
    perform 1 from commerce.payment p join commerce.refund r on r.payment_id=p.id
      where p.id=new.payment_id and r.id=new.native_refund_id and p.deleted_at is null and p.canceled_at is null and r.deleted_at is null
        and p.provider_id='pp_stripe_stripe' and p.currency_code='usd' and p.data->>'id'=new.snapshot->>'intent_id'
        and (p.data->>'livemode')::boolean=new.livemode and r.amount*100=new.total_cents and r.amount=(r.raw_amount->>'value')::numeric
        and r.created_by=allocation.staff_id and r.created_at>=allocation.first_attempt_at
        and r.metadata->'snowforce_refund'->>'operation_id'=allocation.id::text
        and r.metadata->'snowforce_refund'->>'allocation_fingerprint'=allocation.allocation_fingerprint for update of p,r;
    if not found then raise exception 'Refund native identity or amounts changed' using errcode='23514'; end if;
    return new;
  end if;
  if tg_table_name='snowforce_refund_tax_results' then
    if not exists(select 1 from commerce.snowforce_refund_tax_tasks t join commerce.snowforce_refund_allocations a on a.id=t.id
      join commerce.snowforce_refund_funds f on f.allocation_id=t.id where t.id=new.task_id and t.state='running' and t.lease_until>clock_timestamp()
        and t.remote_id=new.transaction_id and a.account_id=new.account_id and a.livemode=new.livemode
        and f.fingerprint=t.funds_fingerprint and a.total_cents=(new.snapshot->>'total_cents')::integer
        and (new.snapshot->'transaction'->>'created')::numeric>=(f.snapshot->'refund'->>'created')::numeric
        and (new.snapshot->'transaction'->>'posted_at')::numeric>=(f.snapshot->'refund'->>'created')::numeric
        and new.snapshot->'transaction'->'reversal'->>'original_transaction'=a.allocation->>'sale_transaction_id') then
      raise exception 'Refund tax result needs its current running task' using errcode='23514';
    end if;
    return new;
  end if;
  if tg_op='INSERT' then
    if new.state<>'queued' or new.remote_id is not null or new.attempts<>0 or new.first_attempt_at is not null
      or not exists(select 1 from commerce.snowforce_refund_allocations a join commerce.snowforce_refund_funds f on f.allocation_id=a.id where a.id=new.id
        and a.state='started' and a.allocation_fingerprint=new.allocation_fingerprint and a.request_fingerprint=new.request_fingerprint and f.fingerprint=new.funds_fingerprint) then
      raise exception 'Tax reversal needs verified immutable funds first' using errcode='23514';
    end if;
    return new;
  end if;
  if (to_jsonb(new)-array['state','remote_id','attempts','first_attempt_at','next_attempt_at','claim_token','lease_until','error_code','updated_at'])
    is distinct from (to_jsonb(old)-array['state','remote_id','attempts','first_attempt_at','next_attempt_at','claim_token','lease_until','error_code','updated_at'])
    or old.state='ready' or new.attempts<old.attempts
    or (old.first_attempt_at is not null and new.first_attempt_at is distinct from old.first_attempt_at)
    or (old.remote_id is not null and new.remote_id is distinct from old.remote_id) then
    raise exception 'Refund tax task identity and completed state cannot be replaced' using errcode='23514';
  end if;
  if new.state='ready' and not exists(select 1 from commerce.snowforce_refund_tax_results r where r.task_id=new.id and r.transaction_id=new.remote_id) then
    raise exception 'Refund tax completion needs an immutable result' using errcode='23514';
  end if;
  return new;
end $$;
create trigger guard_snowforce_refund_funds before insert or update or delete on commerce.snowforce_refund_funds for each row execute function commerce.guard_refund_tax_ledger();
create trigger guard_snowforce_refund_tax_tasks before insert or update or delete on commerce.snowforce_refund_tax_tasks for each row execute function commerce.guard_refund_tax_ledger();
create trigger guard_snowforce_refund_tax_results before insert or update or delete on commerce.snowforce_refund_tax_results for each row execute function commerce.guard_refund_tax_ledger();
alter table commerce.snowforce_refund_funds owner to snowforce_commerce;
alter table commerce.snowforce_refund_tax_tasks owner to snowforce_commerce;
alter table commerce.snowforce_refund_tax_results owner to snowforce_commerce;
alter function commerce.guard_refund_tax_ledger() owner to snowforce_commerce;
alter table commerce.snowforce_refund_funds enable row level security;
alter table commerce.snowforce_refund_tax_tasks enable row level security;
alter table commerce.snowforce_refund_tax_results enable row level security;
revoke all on commerce.snowforce_refund_funds,commerce.snowforce_refund_tax_tasks,commerce.snowforce_refund_tax_results from public,anon,authenticated,service_role;
revoke all on function commerce.guard_refund_tax_ledger() from public,anon,authenticated,service_role;
grant select,insert on commerce.snowforce_refund_funds,commerce.snowforce_refund_tax_results to snowforce_commerce;
grant select,insert,update on commerce.snowforce_refund_tax_tasks to snowforce_commerce;
grant execute on function commerce.guard_refund_tax_ledger() to snowforce_commerce;
