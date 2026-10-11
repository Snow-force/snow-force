-- Shared marketing state stays in the private commerce schema.
create table commerce.snowforce_marketing_campaigns (
  id uuid primary key, surface text not null check(surface in ('event','shop')),
  source jsonb not null, source_fingerprint text not null, content jsonb not null, version integer not null default 1,
  status text not null default 'draft' check(status in ('draft','queued','processing','completed','attention')),
  created_by text not null, created_at timestamptz not null default now(), sent_at timestamptz,
  send_key uuid unique, audience jsonb, test_version integer
);
create table commerce.snowforce_marketing_recipients (
  id uuid primary key, campaign_id uuid not null references commerce.snowforce_marketing_campaigns(id),
  email text not null, sources jsonb not null, status text not null default 'queued'
    check(status in ('queued','sending','accepted','delivered','failed','suppressed','bounced','complained','attention')),
  provider_id text unique, attempts integer not null default 0, first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(), lease_until timestamptz,
  message jsonb, error_code text, unique(campaign_id,email)
);
create index marketing_pending on commerce.snowforce_marketing_recipients(next_attempt_at) where status in ('queued','sending');
create table commerce.snowforce_marketing_suppressions (
  email text primary key, reason text not null, created_at timestamptz not null default now()
);
create table commerce.snowforce_marketing_events (
  id text primary key, email_id text not null, type text not null, processed boolean not null default false,
  created_at timestamptz not null default now()
);
create table commerce.snowforce_marketing_nonces (
  nonce uuid primary key, created_at timestamptz not null default now()
);
create table commerce.snowforce_marketing_rate_windows (minute timestamptz primary key, attempts integer not null);
alter table commerce.snowforce_marketing_rate_windows owner to snowforce_commerce;
alter table commerce.snowforce_marketing_rate_windows enable row level security;
revoke all on commerce.snowforce_marketing_rate_windows from public,anon,authenticated,service_role;
alter table commerce.snowforce_marketing_campaigns owner to snowforce_commerce;
alter table commerce.snowforce_marketing_recipients owner to snowforce_commerce;
alter table commerce.snowforce_marketing_suppressions owner to snowforce_commerce;
alter table commerce.snowforce_marketing_events owner to snowforce_commerce;
alter table commerce.snowforce_marketing_nonces owner to snowforce_commerce;
alter table commerce.snowforce_marketing_campaigns enable row level security;
alter table commerce.snowforce_marketing_recipients enable row level security;
alter table commerce.snowforce_marketing_suppressions enable row level security;
alter table commerce.snowforce_marketing_events enable row level security;
alter table commerce.snowforce_marketing_nonces enable row level security;
revoke all on commerce.snowforce_marketing_campaigns,commerce.snowforce_marketing_recipients,
  commerce.snowforce_marketing_suppressions,commerce.snowforce_marketing_events,commerce.snowforce_marketing_nonces from public,anon,authenticated,service_role;
-- Website service-role access only; no customer/anonymous policies.
create table public.marketing_internal_nonces (nonce uuid primary key, created_at timestamptz not null default now());
alter table public.marketing_internal_nonces enable row level security;
revoke all on public.marketing_internal_nonces from public,anon,authenticated;
grant select,insert,delete on public.marketing_internal_nonces to service_role;
