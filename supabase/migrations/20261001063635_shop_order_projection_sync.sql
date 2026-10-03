-- Extend the existing member read model. Commerce remains authoritative;
-- its restricted database role receives no permissions on public or auth.
alter table public.shop_member_orders
  add column credit_cents integer not null default 0 check (credit_cents between -2000000000 and 2000000000),
  add column rounding_cents integer not null default 0 check (rounding_cents between -3 and 3),
  add column native_version integer not null default 1 check (native_version > 0),
  add column payment_status text check (payment_status in ('not_paid','awaiting','authorized','partially_authorized','captured','partially_captured','partially_refunded','refunded','canceled','requires_action')),
  add column fulfillment_status text check (fulfillment_status in ('not_fulfilled','partially_fulfilled','fulfilled','partially_shipped','shipped','partially_delivered','delivered','canceled')),
  add column source_observed_at timestamptz not null default '-infinity';
alter table public.shop_member_orders drop constraint shop_member_orders_check;
alter table public.shop_member_orders add constraint shop_member_orders_total_check check (
  subtotal_cents::bigint + shipping_cents::bigint + tax_cents::bigint - discount_cents::bigint
  - credit_cents::bigint + rounding_cents::bigint = total_cents::bigint
);

-- Only the existing Next server service role can execute this invoker RPC.
-- A per-order transaction lock prevents races, owner changes and stale writes.
create function public.shop_sync_member_order(member_id uuid, snapshot jsonb, observed_at timestamptz)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  incoming public.shop_member_orders;
  existing public.shop_member_orders;
  affected integer;
begin
  incoming := pg_catalog.jsonb_populate_record(null::public.shop_member_orders, snapshot);
  if member_id is null or incoming.user_id is distinct from member_id or incoming.id is null or incoming.id !~ '^order_[A-Za-z0-9]{1,114}$'
     or incoming.payment_status is null or incoming.fulfillment_status is null or observed_at is null
     or not pg_catalog.isfinite(observed_at) or observed_at > pg_catalog.now() + interval '5 minutes' then
    raise exception 'Invalid order snapshot' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(incoming.items) is distinct from 'array' then
    raise exception 'Invalid order items' using errcode = '22023';
  end if;
  if (select coalesce(pg_catalog.sum((item->>'totalCents')::bigint), -1) from pg_catalog.jsonb_array_elements(incoming.items) item) <> incoming.subtotal_cents
     or (select pg_catalog.count(distinct item->>'id') from pg_catalog.jsonb_array_elements(incoming.items) item) <> pg_catalog.jsonb_array_length(incoming.items)
     or exists (select 1 from pg_catalog.jsonb_array_elements(incoming.items) item where
       item->>'totalCents' is null or (item->>'totalCents')::bigint < 0
       or item->>'quantity' is null or (item->>'quantity')::integer not between 1 and 10000
       or item->>'returnedQuantity' is null or (item->>'returnedQuantity')::integer < 0
       or (item->>'returnedQuantity')::integer > (item->>'quantity')::integer) then
    raise exception 'Invalid order items' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(incoming.id, 7301));
  select * into existing from public.shop_member_orders where id = incoming.id;
  if found and existing.user_id is distinct from member_id then
    raise exception 'Order owner mismatch' using errcode = '42501';
  end if;
  insert into public.shop_member_orders as stored (
    id,user_id,order_number,status,currency,subtotal_cents,shipping_cents,tax_cents,discount_cents,
    credit_cents,rounding_cents,total_cents,native_version,payment_status,fulfillment_status,
    items,shipments,shipping_address,created_at,updated_at,source_observed_at
  ) values (
    incoming.id,member_id,incoming.order_number,incoming.status,incoming.currency,incoming.subtotal_cents,
    incoming.shipping_cents,incoming.tax_cents,incoming.discount_cents,incoming.credit_cents,incoming.rounding_cents,
    incoming.total_cents,incoming.native_version,incoming.payment_status,incoming.fulfillment_status,
    incoming.items,incoming.shipments,incoming.shipping_address,incoming.created_at,incoming.updated_at,observed_at
  ) on conflict (id) do update set
    order_number=excluded.order_number,status=excluded.status,currency=excluded.currency,
    subtotal_cents=excluded.subtotal_cents,shipping_cents=excluded.shipping_cents,tax_cents=excluded.tax_cents,
    discount_cents=excluded.discount_cents,credit_cents=excluded.credit_cents,rounding_cents=excluded.rounding_cents,
    total_cents=excluded.total_cents,native_version=excluded.native_version,payment_status=excluded.payment_status,
    fulfillment_status=excluded.fulfillment_status,items=excluded.items,shipments=excluded.shipments,
    shipping_address=excluded.shipping_address,updated_at=excluded.updated_at,source_observed_at=excluded.source_observed_at
  where excluded.native_version > stored.native_version
     or (excluded.native_version = stored.native_version and excluded.source_observed_at >= stored.source_observed_at);
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;
revoke all on function public.shop_sync_member_order(uuid,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.shop_sync_member_order(uuid,jsonb,timestamptz) to service_role;
comment on function public.shop_sync_member_order(uuid,jsonb,timestamptz) is 'Trusted USD order projection; immutable owner and version/observation guarded updates. No customer write access.';
