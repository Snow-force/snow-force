-- A registration can accept its frozen waiver snapshot exactly once.
-- This makes webhook and member-confirmation retries safe.
delete from public.waiver_acceptances older
using public.waiver_acceptances newer
where older.registration_id = newer.registration_id
  and older.id < newer.id;

create unique index if not exists waiver_acceptances_one_per_registration
  on public.waiver_acceptances(registration_id);
