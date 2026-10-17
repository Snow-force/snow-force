-- Preview evidence is private and separate from native tax operations: an
-- abandoned/ambiguous estimate must never lock edits or a real payment.
create table commerce.snowforce_checkout_quote_drafts (
  id uuid primary key,
  cart_id text not null,
  customer_id text not null,
  input jsonb not null,
  setup_fingerprint text not null check (setup_fingerprint ~ '^[a-f0-9]{64}$'),
  namespace text not null check (namespace ~ '^[a-f0-9]{64}$'),
  binding_fingerprint text not null check (binding_fingerprint ~ '^[a-f0-9]{64}$'),
  state text not null default 'pending' check (state in ('pending','ready')),
  calculation jsonb,
  snapshot jsonb,
  expires_at bigint not null,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  check ((state='pending' and calculation is null and snapshot is null and completed_at is null) or
         (state='ready' and calculation is not null and snapshot is not null and completed_at is not null)),
  check (input->>'cart_id'=cart_id and input->>'customer_id'=customer_id),
  check (expires_at>(input->>'tax_date')::bigint and expires_at<=(input->>'tax_date')::bigint+900)
);
create index snowforce_checkout_quote_drafts_lookup on commerce.snowforce_checkout_quote_drafts(cart_id,customer_id,binding_fingerprint,created_at desc);
create index snowforce_checkout_quote_drafts_customer_recent on commerce.snowforce_checkout_quote_drafts(customer_id,created_at desc);
create function commerce.guard_checkout_quote_draft() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Checkout quote evidence is immutable'; end if;
  if old.state<>'pending' or new.state<>'ready' or old.id<>new.id or old.cart_id<>new.cart_id or old.customer_id<>new.customer_id
    or old.input is distinct from new.input or old.setup_fingerprint<>new.setup_fingerprint or old.namespace<>new.namespace
    or old.binding_fingerprint<>new.binding_fingerprint or old.created_at<>new.created_at or new.expires_at>old.expires_at
    then raise exception 'Invalid checkout quote transition'; end if;
  return new;
end $$;
create trigger guard_snowforce_checkout_quote_drafts before update or delete on commerce.snowforce_checkout_quote_drafts for each row execute function commerce.guard_checkout_quote_draft();
alter table commerce.snowforce_checkout_quote_drafts owner to snowforce_commerce;
alter function commerce.guard_checkout_quote_draft() owner to snowforce_commerce;
alter table commerce.snowforce_checkout_quote_drafts enable row level security;
revoke all on commerce.snowforce_checkout_quote_drafts from public,anon,authenticated,service_role;
revoke all on function commerce.guard_checkout_quote_draft() from public,anon,authenticated,service_role;
grant execute on function commerce.guard_checkout_quote_draft() to snowforce_commerce;
comment on table commerce.snowforce_checkout_quote_drafts is 'Private estimate calculation evidence. Never authorizes payment, reserves stock, applies native cart taxes or records a sale.';
