-- No auth/customer foreign keys: deleting an account must not reset eligibility.
create table commerce.snowforce_newcomer_claims (
  member_id uuid primary key,
  email_hash text not null unique check(email_hash ~ '^[a-f0-9]{64}$'),
  customer_id text not null unique,
  code text not null unique,
  created_at timestamptz not null default now()
);
alter table commerce.snowforce_newcomer_claims owner to snowforce_commerce;
alter table commerce.snowforce_newcomer_claims enable row level security;
revoke all on commerce.snowforce_newcomer_claims from public,anon,authenticated,service_role;
