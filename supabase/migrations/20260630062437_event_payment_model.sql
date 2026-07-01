-- Per-event payment model: free | deposit | full_prepay, with structured amounts.
-- Adds columns alongside the existing fee_amount text column (which stays for display).
-- Existing rows default to payment_model='free', deposit_currency='usd' so they remain valid.
alter table public.events
  add column if not exists payment_model text not null default 'free'
    check (payment_model in ('free', 'deposit', 'full_prepay')),
  add column if not exists deposit_amount numeric(10, 2),
  add column if not exists deposit_currency text not null default 'usd'
    check (deposit_currency in ('usd', 'cny', 'eur', 'gbp', 'jpy')),
  add column if not exists full_payment_amount numeric(10, 2);

create index if not exists idx_events_payment_model
  on public.events(payment_model);

-- rollback: alter table public.events drop column if exists payment_model, drop column if exists deposit_amount, drop column if exists deposit_currency, drop column if exists full_payment_amount;
