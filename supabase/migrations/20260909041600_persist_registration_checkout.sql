-- Keep the pending ID and agreed checkout immutable while money can move.
-- Existing member/event uniqueness arbitrates concurrent form submissions.
alter table public.pending_registrations
  add column checkout_attempt jsonb,
  add column fulfilled_registration_id uuid references public.registrations(id);

alter table public.pending_registrations
  add constraint pending_checkout_attempt_object check (
    checkout_attempt is null or (
      jsonb_typeof(checkout_attempt) = 'object'
      and checkout_attempt ? 'id' and checkout_attempt ? 'params'
    )
  );

create or replace function private.protect_pending_checkout()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.checkout_attempt is not null or old.fulfilled_registration_id is not null then
    if tg_op = 'DELETE' then
      raise exception 'Paid or in-progress checkout records must be retained';
    end if;
    if (to_jsonb(new) - 'checkout_attempt' - 'fulfilled_registration_id')
       is distinct from (to_jsonb(old) - 'checkout_attempt' - 'fulfilled_registration_id') then
      raise exception 'Checkout registration details are locked';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.protect_pending_checkout() from public, anon, authenticated;
create trigger protect_pending_checkout before update or delete on public.pending_registrations
  for each row execute function private.protect_pending_checkout();

-- No new client grants or policies: these fields remain behind existing staff RLS.
