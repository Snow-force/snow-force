-- Native Medusa writes its capture before calling the provider. Guard that
-- write so every native workflow/module path rejects partial Stripe captures.
do $$
begin
  if exists (
    select 1 from commerce.capture c join commerce.payment p on p.id=c.payment_id
    where p.provider_id='pp_stripe_stripe' and c.deleted_at is null and p.deleted_at is null
    and (p.currency_code<>'usd' or p.amount<=0 or p.amount>999999.99
      or p.amount*100<>trunc(p.amount*100) or c.amount<>p.amount
      or (select count(*) from commerce.capture other where other.payment_id=p.id and other.deleted_at is null)<>1
      or coalesce(p.raw_amount->>'value','') !~ '^[0-9]+(\.[0-9]+)?$'
      or coalesce(c.raw_amount->>'value','') !~ '^[0-9]+(\.[0-9]+)?$'
      or case when p.raw_amount->>'value' ~ '^[0-9]+(\.[0-9]+)?$' then (p.raw_amount->>'value')::numeric else null end is distinct from p.amount
      or case when c.raw_amount->>'value' ~ '^[0-9]+(\.[0-9]+)?$' then (c.raw_amount->>'value')::numeric else null end is distinct from p.amount)
  ) then
    raise exception 'Reconcile existing Stripe captures before installing the full-capture boundary' using errcode='23514';
  end if;
end $$;

create function commerce.guard_single_full_stripe_capture() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  payment commerce.payment%rowtype;
begin
  if tg_op='UPDATE' and old.payment_id is distinct from new.payment_id
    and exists(select 1 from commerce.payment p where p.id=old.payment_id and p.provider_id='pp_stripe_stripe') then
    raise exception 'Stripe capture identity cannot be reassigned' using errcode='23514';
  end if;

  select * into payment from commerce.payment p where p.id=new.payment_id for update;
  if not found or payment.provider_id<>'pp_stripe_stripe' then
    return new;
  end if;
  if tg_op='UPDATE' and (old.id is distinct from new.id or old.payment_id is distinct from new.payment_id
    or old.amount is distinct from new.amount or old.raw_amount is distinct from new.raw_amount) then
    raise exception 'Stripe capture amounts and identity are immutable' using errcode='23514';
  end if;
  -- A provider failure can remove its provisional row; native retry then creates
  -- a new full row. Tombstones never count as successful captures.
  if new.deleted_at is not null then
    return new;
  end if;
  if payment.deleted_at is not null or payment.canceled_at is not null
    or payment.currency_code<>'usd' or payment.amount<=0 or payment.amount>999999.99
    or payment.amount*100<>trunc(payment.amount*100)
    or new.amount is distinct from payment.amount
    or coalesce(payment.raw_amount->>'value','') !~ '^[0-9]+(\.[0-9]+)?$'
    or coalesce(new.raw_amount->>'value','') !~ '^[0-9]+(\.[0-9]+)?$' then
    raise exception 'Only one exact full USD Stripe capture is supported' using errcode='23514';
  end if;
  if (payment.raw_amount->>'value')::numeric<>payment.amount
    or (new.raw_amount->>'value')::numeric<>payment.amount then
    raise exception 'Stripe capture raw amounts do not match' using errcode='23514';
  end if;
  if exists(select 1 from commerce.capture c where c.payment_id=payment.id and c.deleted_at is null and c.id<>new.id) then
    raise exception 'A Stripe payment can have only one full capture' using errcode='23514';
  end if;
  return new;
end $$;

create trigger guard_single_full_stripe_capture
before insert or update on commerce.capture
for each row execute function commerce.guard_single_full_stripe_capture();
alter function commerce.guard_single_full_stripe_capture() owner to snowforce_commerce;
revoke all on function commerce.guard_single_full_stripe_capture() from public,anon,authenticated,service_role;
grant execute on function commerce.guard_single_full_stripe_capture() to snowforce_commerce;
comment on function commerce.guard_single_full_stripe_capture() is 'SnowForce v1: serialize each Stripe payment and reject partial, repeated or rewritten native captures before the provider call.';
