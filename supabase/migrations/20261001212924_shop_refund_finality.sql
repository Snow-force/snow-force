-- Private Stripe funds observations. Native Medusa still executes captures/refunds.
-- Never put this staff/provider evidence in customer-readable order metadata.
create table commerce.snowforce_refund_verifications (
  order_id text primary key references commerce."order"(id),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  observed_at timestamptz not null,
  state text not null check (state in ('verified','pending','exception')),
  snapshot jsonb not null check (
    jsonb_typeof(snapshot)='object' and snapshot ?& array['schema_version','order_id','fingerprint','state','payments','observed_at'] and snapshot->>'schema_version'='1'
    and snapshot->>'order_id'=order_id and snapshot->>'fingerprint'=fingerprint
    and snapshot->>'state'=state and jsonb_typeof(snapshot->'payments')='array'
    and octet_length(snapshot::text)<=4194304
  ),
  audit jsonb not null check (jsonb_typeof(audit)='object' and audit ? 'source' and audit->>'source' in ('staff','stripe_webhook','native_payment')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index snowforce_refund_verification_exceptions on commerce.snowforce_refund_verifications(state,observed_at desc)
  where state <> 'verified';

create table commerce.snowforce_refund_verification_history (
  id uuid primary key,
  order_id text not null references commerce."order"(id),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  observed_at timestamptz not null,
  state text not null check (state in ('verified','pending','exception')),
  snapshot jsonb not null check (
    jsonb_typeof(snapshot)='object' and snapshot ?& array['schema_version','order_id','fingerprint','state','payments','observed_at'] and snapshot->>'schema_version'='1'
    and snapshot->>'order_id'=order_id and snapshot->>'fingerprint'=fingerprint
    and snapshot->>'state'=state and jsonb_typeof(snapshot->'payments')='array'
    and octet_length(snapshot::text)<=4194304
  ),
  audit jsonb not null check (jsonb_typeof(audit)='object' and audit ? 'source' and audit->>'source' in ('staff','stripe_webhook','native_payment')),
  created_at timestamptz not null default now()
);
create index snowforce_refund_verification_order_history on commerce.snowforce_refund_verification_history(order_id,observed_at desc);
create function commerce.guard_refund_verification_history() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  raise exception 'Refund observations are append-only' using errcode='23514';
end $$;
create trigger guard_snowforce_refund_verification_history before update or delete on commerce.snowforce_refund_verification_history
  for each row execute function commerce.guard_refund_verification_history();

alter table commerce.snowforce_refund_verifications owner to snowforce_commerce;
alter table commerce.snowforce_refund_verification_history owner to snowforce_commerce;
alter function commerce.guard_refund_verification_history() owner to snowforce_commerce;
alter table commerce.snowforce_refund_verifications enable row level security;
alter table commerce.snowforce_refund_verification_history enable row level security;
revoke all on commerce.snowforce_refund_verifications,commerce.snowforce_refund_verification_history from public,anon,authenticated,service_role;
revoke all on function commerce.guard_refund_verification_history() from public,anon,authenticated,service_role;
grant execute on function commerce.guard_refund_verification_history() to snowforce_commerce;
comment on table commerce.snowforce_refund_verifications is 'Private latest reconciliation of native payment/refund cents against current Stripe funds status; never a command to issue funds.';
comment on table commerce.snowforce_refund_verification_history is 'Append-only staff/webhook observations including Stripe refund identifiers and states; no customer or Data API access.';
