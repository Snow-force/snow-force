-- Fixed activity package total per participant, inclusive of lodging.
-- NULL preserves legacy drafts: hotel cost estimates are never converted to sale prices.
alter table public.event_lodging_offers
  add column package_amount integer check (package_amount between 1 and 100000000);

comment on column public.event_lodging_offers.package_amount is
  'USD cents per person for the full activity package including lodging. Fixed regardless of roommate count. Staff allocate rooms; draft only.';

-- Keep existing server-only grants, audit triggers and sales_enabled=false.
