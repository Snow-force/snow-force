create table commerce.snowforce_newcomer_emails (
  code text primary key references commerce.snowforce_newcomer_claims(code),
  email text not null unique,
  ends_at timestamptz not null,
  status text not null default 'queued' check(status in ('queued','sending','accepted','failed','suppressed','expired','attention')),
  attempts integer not null default 0,
  first_attempt_at timestamptz, next_attempt_at timestamptz not null default now(), lease_until timestamptz,
  message jsonb, provider_id text unique, error_code text,
  delivery_status text check(delivery_status in ('delivered','failed','soft_bounced','bounced','complained')),
  created_at timestamptz not null default now()
);
create index newcomer_emails_pending on commerce.snowforce_newcomer_emails(next_attempt_at) where status in ('queued','sending');
alter table commerce.snowforce_newcomer_emails owner to snowforce_commerce;
alter table commerce.snowforce_newcomer_emails enable row level security;
revoke all on commerce.snowforce_newcomer_emails from public,anon,authenticated,service_role;
