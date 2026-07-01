-- Stripe webhook event idempotency table.
-- Only the service role can read/write; the webhook route uses the service-role Supabase client.
create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;

create policy "service role manages stripe webhook events"
  on public.stripe_webhook_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
