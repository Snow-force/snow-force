-- Private, restart-safe sale-tax tasks. No existing order/payment facts are rewritten.
create table commerce.snowforce_tax_sale_tasks (
  id uuid primary key,
  order_id text not null unique references commerce."order"(id),
  quote_id uuid not null unique references commerce.snowforce_tax_quotes(id),
  payment_id text not null unique references commerce.payment(id),
  capture_id text not null unique references commerce.capture(id),
  account_id text not null check (account_id ~ '^acct_[A-Za-z0-9]+$'),
  livemode boolean not null,
  total_cents integer not null check (total_cents between 1 and 99999999),
  source jsonb not null check (jsonb_typeof(source)='object' and source ?& array['schema_version','order_id','quote_id','payment_id','capture_id','input','calculation','receipt']
    and source->>'schema_version'='1' and source->>'order_id'=order_id and source->>'quote_id'=quote_id::text
    and source->>'payment_id'=payment_id and source->>'capture_id'=capture_id
    and source->'input'->>'account_id'=account_id and (source->'input'->>'livemode')::boolean=livemode
    and (source->'receipt'->>'total_cents')::integer=total_cents and octet_length(source::text)<=4194304),
  source_fingerprint text not null check (source_fingerprint ~ '^[a-f0-9]{64}$'),
  request jsonb not null check (jsonb_typeof(request)='object' and request ?& array['calculation','reference','posted_at','metadata']
    and request->>'calculation'=source->'calculation'->>'id' and request->>'reference'='snowforce-sale:'||id::text
    and (request->>'posted_at')::bigint=(source->>'captured_at')::bigint and request->'metadata'->>'snowforce_operation'=id::text and octet_length(request::text)<=8192),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  state text not null default 'queued' check (state in ('queued','running','retry','reconcile_required','ready')),
  remote_id text check (remote_id ~ '^tax_[A-Za-z0-9]+$'),
  attempts integer not null default 0 check (attempts>=0),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default clock_timestamp(),
  claim_token uuid,
  lease_until timestamptz,
  error_code text check (error_code in ('provider_unavailable','evidence_changed','request_aged','transaction_mismatch')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((state='running' and claim_token is not null and lease_until is not null and first_attempt_at is not null and attempts>0) or (state<>'running' and claim_token is null and lease_until is null)),
  check (state<>'ready' or (remote_id is not null and error_code is null)),
  unique(account_id,livemode,remote_id)
);
create index snowforce_tax_sale_task_due on commerce.snowforce_tax_sale_tasks(next_attempt_at,created_at,id) where state in ('queued','retry');
create index snowforce_tax_sale_task_lease on commerce.snowforce_tax_sale_tasks(lease_until) where state='running';

create table commerce.snowforce_tax_sales (
  task_id uuid primary key references commerce.snowforce_tax_sale_tasks(id),
  order_id text not null unique references commerce."order"(id),
  quote_id uuid not null unique references commerce.snowforce_tax_quotes(id),
  account_id text not null check (account_id ~ '^acct_[A-Za-z0-9]+$'),
  livemode boolean not null,
  transaction_id text not null check (transaction_id ~ '^tax_[A-Za-z0-9]+$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object' and snapshot ?& array['schema_version','transaction','lines','total_cents']
    and snapshot->>'schema_version'='1' and snapshot->'transaction'->>'id'=transaction_id
    and snapshot->'transaction'->>'reference'='snowforce-sale:'||task_id::text
    and (snapshot->'transaction'->>'livemode')::boolean=livemode and jsonb_typeof(snapshot->'lines')='array' and octet_length(snapshot::text)<=4194304),
  resolution jsonb check (resolution is null or jsonb_typeof(resolution) in ('object','null')),
  created_at timestamptz not null default clock_timestamp(),
  unique(account_id,livemode,transaction_id)
);
create function commerce.guard_tax_sale_ledger() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' or (tg_table_name='snowforce_tax_sales' and tg_op='UPDATE') then
    raise exception 'Sale tax evidence is immutable' using errcode='23514';
  end if;
  if tg_table_name='snowforce_tax_sales' then
    if not exists(select 1 from commerce.snowforce_tax_sale_tasks t where t.id=new.task_id and t.order_id=new.order_id and t.quote_id=new.quote_id
      and t.account_id=new.account_id and t.livemode=new.livemode and t.remote_id=new.transaction_id
      and t.state='running' and t.lease_until>clock_timestamp() and t.total_cents=(new.snapshot->>'total_cents')::integer) then
      raise exception 'Sale tax result does not match its running task' using errcode='23514';
    end if;
    return new;
  end if;
  if (to_jsonb(new)-array['state','remote_id','attempts','first_attempt_at','next_attempt_at','claim_token','lease_until','error_code','updated_at'])
    is distinct from (to_jsonb(old)-array['state','remote_id','attempts','first_attempt_at','next_attempt_at','claim_token','lease_until','error_code','updated_at'])
    or old.state='ready' or new.attempts<old.attempts
    or (old.first_attempt_at is not null and new.first_attempt_at is distinct from old.first_attempt_at)
    or (old.remote_id is not null and new.remote_id is distinct from old.remote_id) then
    raise exception 'Sale tax request or identity cannot be replaced' using errcode='23514';
  end if;
  if new.state='ready' and not exists(select 1 from commerce.snowforce_tax_sales s where s.task_id=new.id and s.transaction_id=new.remote_id) then
    raise exception 'Sale tax completion needs an immutable result' using errcode='23514';
  end if;
  return new;
end $$;
create trigger guard_snowforce_tax_sale_tasks before update or delete on commerce.snowforce_tax_sale_tasks for each row execute function commerce.guard_tax_sale_ledger();
create trigger guard_snowforce_tax_sales before insert or update or delete on commerce.snowforce_tax_sales for each row execute function commerce.guard_tax_sale_ledger();
alter table commerce.snowforce_tax_sale_tasks owner to snowforce_commerce;
alter table commerce.snowforce_tax_sales owner to snowforce_commerce;
alter function commerce.guard_tax_sale_ledger() owner to snowforce_commerce;
alter table commerce.snowforce_tax_sale_tasks enable row level security;
alter table commerce.snowforce_tax_sales enable row level security;
revoke all on commerce.snowforce_tax_sale_tasks,commerce.snowforce_tax_sales from public,anon,authenticated,service_role;
revoke all on function commerce.guard_tax_sale_ledger() from public,anon,authenticated,service_role;
grant execute on function commerce.guard_tax_sale_ledger() to snowforce_commerce;
comment on table commerce.snowforce_tax_sale_tasks is 'Fixed captured-sale request, restart-safe fenced retries and remote ID recovery. Never captures or refunds funds.';
comment on table commerce.snowforce_tax_sales is 'Immutable verified Stripe tax sale and transaction line IDs; refund reversal evidence is separate.';
