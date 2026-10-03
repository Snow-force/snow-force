-- Private calculation requests, immutable results and native application evidence.
-- No customer policies, Data API grants or provider/network calls are introduced.
create table commerce.snowforce_tax_operations (
  id uuid primary key,
  cart_id text not null references commerce.cart(id),
  customer_id text not null references commerce.customer(id),
  input jsonb not null check (jsonb_typeof(input)='object' and input ?& array['cart_id','customer_id'] and input->>'cart_id'=cart_id and input->>'customer_id'=customer_id and octet_length(input::text)<=1048576),
  setup_fingerprint text not null check (setup_fingerprint ~ '^[a-f0-9]{64}$'),
  namespace text not null check (namespace ~ '^[a-f0-9]{64}$'),
  binding_fingerprint text not null check (binding_fingerprint ~ '^[a-f0-9]{64}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  request jsonb not null check (jsonb_typeof(request)='object' and request ? 'currency' and request->>'currency'='usd' and octet_length(request::text)<=1048576),
  state text not null default 'pending' check (state in ('pending','ready')),
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check ((state='pending' and completed_at is null) or (state='ready' and completed_at is not null and completed_at>=created_at))
);
create unique index snowforce_tax_one_pending_cart on commerce.snowforce_tax_operations(cart_id) where state='pending';
create index snowforce_tax_operation_cart_history on commerce.snowforce_tax_operations(cart_id,created_at desc);

create table commerce.snowforce_tax_quotes (
  id uuid primary key references commerce.snowforce_tax_operations(id),
  cart_id text not null references commerce.cart(id),
  customer_id text not null references commerce.customer(id),
  calculation_id text not null check (calculation_id ~ '^taxcalc_[A-Za-z0-9]+$'),
  account_id text not null check (account_id ~ '^acct_[A-Za-z0-9]+$'),
  livemode boolean not null,
  setup_fingerprint text not null check (setup_fingerprint ~ '^[a-f0-9]{64}$'),
  binding_fingerprint text not null check (binding_fingerprint ~ '^[a-f0-9]{64}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  tax_date bigint not null check (tax_date>0),
  expires_at bigint not null check (expires_at>tax_date and expires_at<=tax_date+900),
  total_cents integer not null check (total_cents between 1 and 99999999),
  input jsonb not null check (jsonb_typeof(input)='object' and input ?& array['cart_id','customer_id'] and input->>'cart_id'=cart_id and input->>'customer_id'=customer_id and octet_length(input::text)<=1048576),
  calculation jsonb not null check (jsonb_typeof(calculation)='object' and calculation ?& array['id','currency'] and calculation->>'id'=calculation_id and calculation->>'currency'='usd' and octet_length(calculation::text)<=4194304),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object' and snapshot ?& array['schema_version','calculation_id','account_id','livemode','tax_date','expires_at','binding_fingerprint','request_fingerprint','input','lines','shipping','fees','amounts','breakdown']
    and snapshot->>'schema_version'='1' and snapshot->>'calculation_id'=calculation_id and snapshot->>'account_id'=account_id
    and (snapshot->>'livemode')::boolean=livemode and (snapshot->>'tax_date')::bigint=tax_date and (snapshot->>'expires_at')::bigint=expires_at
    and snapshot->>'binding_fingerprint'=binding_fingerprint and snapshot->>'request_fingerprint'=request_fingerprint
    and (snapshot->'amounts'->>'total_cents')::integer=total_cents and snapshot->'input'=input and jsonb_typeof(snapshot->'lines')='array'
    and octet_length(snapshot::text)<=4194304),
  created_at timestamptz not null default clock_timestamp(),
  unique(account_id,livemode,calculation_id)
);
create index snowforce_tax_quote_cart_history on commerce.snowforce_tax_quotes(cart_id,created_at desc);

create table commerce.snowforce_tax_quote_applications (
  quote_id uuid primary key references commerce.snowforce_tax_quotes(id),
  receipt jsonb not null check (jsonb_typeof(receipt)='object' and receipt ?& array['schema_version','quote_id','cart_id','customer_id','account_id','livemode','setup_fingerprint','checkout_fingerprint','total_cents','expires_at','signature']
    and receipt->>'schema_version'='1' and receipt->>'quote_id'=quote_id::text and receipt->>'signature' ~ '^[a-f0-9]{64}$' and octet_length(receipt::text)<=8192),
  payment_session_id text unique references commerce.payment_session(id),
  bound_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check ((payment_session_id is null and bound_at is null) or (payment_session_id is not null and bound_at is not null and bound_at>=created_at))
);

create function commerce.guard_tax_quote_ledger() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' or tg_table_name='snowforce_tax_quotes' then
    raise exception 'Tax quote evidence is immutable' using errcode='23514';
  end if;
  if tg_table_name='snowforce_tax_operations' then
    if (to_jsonb(new)-array['state','completed_at']) is distinct from (to_jsonb(old)-array['state','completed_at'])
      or old.state<>'pending' or new.state<>'ready' or new.completed_at is null
      or not exists(select 1 from commerce.snowforce_tax_quotes q where q.id=new.id and q.cart_id=new.cart_id and q.customer_id=new.customer_id
        and q.setup_fingerprint=new.setup_fingerprint and q.binding_fingerprint=new.binding_fingerprint and q.request_fingerprint=new.request_fingerprint) then
      raise exception 'Tax quote request cannot be replaced' using errcode='23514';
    end if;
  else
    if (to_jsonb(new)-array['payment_session_id','bound_at']) is distinct from (to_jsonb(old)-array['payment_session_id','bound_at'])
      or new.payment_session_id is null or new.bound_at is null
      or (old.payment_session_id is not null and (old.payment_session_id<>new.payment_session_id or old.bound_at<>new.bound_at)) then
      raise exception 'Tax quote payment binding cannot be replaced' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger guard_snowforce_tax_operations before update or delete on commerce.snowforce_tax_operations for each row execute function commerce.guard_tax_quote_ledger();
create trigger guard_snowforce_tax_quotes before update or delete on commerce.snowforce_tax_quotes for each row execute function commerce.guard_tax_quote_ledger();
create trigger guard_snowforce_tax_quote_applications before update or delete on commerce.snowforce_tax_quote_applications for each row execute function commerce.guard_tax_quote_ledger();

alter table commerce.snowforce_tax_operations owner to snowforce_commerce;
alter table commerce.snowforce_tax_quotes owner to snowforce_commerce;
alter table commerce.snowforce_tax_quote_applications owner to snowforce_commerce;
alter function commerce.guard_tax_quote_ledger() owner to snowforce_commerce;
alter table commerce.snowforce_tax_operations enable row level security;
alter table commerce.snowforce_tax_quotes enable row level security;
alter table commerce.snowforce_tax_quote_applications enable row level security;
revoke all on commerce.snowforce_tax_operations,commerce.snowforce_tax_quotes,commerce.snowforce_tax_quote_applications from public,anon,authenticated,service_role;
revoke all on function commerce.guard_tax_quote_ledger() from public,anon,authenticated,service_role;
grant execute on function commerce.guard_tax_quote_ledger() to snowforce_commerce;
comment on table commerce.snowforce_tax_operations is 'Private immutable calculation request and permanent idempotency identity; ambiguous expired requests require review.';
comment on table commerce.snowforce_tax_quotes is 'Immutable USD tax calculation including original per-line money, legal breakdowns, ship-from and destination; never a sale or tax transaction.';
comment on table commerce.snowforce_tax_quote_applications is 'Private proof reserved for atomic native tax application; a signed cart label alone cannot authorize payment.';
