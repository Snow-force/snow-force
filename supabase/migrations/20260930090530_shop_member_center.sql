-- Member-facing commerce read model and address book in the EXISTING database.
-- Medusa's authoritative product, inventory and transaction tables belong to the
-- separate, non-Data-API commerce schema when its backend is installed.
-- This migration neither installs Medusa nor copies/changes existing event data.

create table public.shop_member_orders (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,120}$'),
  user_id uuid references auth.users(id) on delete set null,
  order_number text not null check (length(order_number) between 1 and 300),
  status text not null check (status in ('pending','processing','shipped','delivered','cancelled','refunded')),
  currency text not null default 'usd' check (currency = 'usd'),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 100),
  shipments jsonb not null default '[]'::jsonb check (jsonb_typeof(shipments) = 'array' and jsonb_array_length(shipments) <= 50),
  shipping_address jsonb check (shipping_address is null or jsonb_typeof(shipping_address) = 'object'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (subtotal_cents::bigint + shipping_cents::bigint + tax_cents::bigint - discount_cents::bigint = total_cents::bigint)
);
comment on table public.shop_member_orders is 'Read-only member order projection. Backend-owned USD snapshots, never a source of inventory or editable sale prices.';
create index shop_member_orders_owner_created on public.shop_member_orders(user_id, created_at desc, id desc);
create index shop_member_orders_owner_status_created on public.shop_member_orders(user_id, status, created_at desc, id desc);
alter table public.shop_member_orders enable row level security;
revoke all on public.shop_member_orders from anon, authenticated;
grant select on public.shop_member_orders to authenticated;
grant select, insert, update, delete on public.shop_member_orders to service_role;
create policy shop_orders_read_own on public.shop_member_orders for select to authenticated
  using ((select auth.uid()) = user_id);

create table public.shop_shipping_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  phone text not null check (length(trim(phone)) between 7 and 30 and phone ~ '^[+0-9 ().-]+$'),
  address1 text not null check (length(trim(address1)) between 1 and 200),
  address2 text not null default '' check (length(address2) <= 200),
  city text not null check (length(trim(city)) between 1 and 100),
  state text not null check (state in ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY')),
  postal_code text not null check (postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'),
  country_code text not null default 'US' check (country_code = 'US'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shop_shipping_addresses_owner on public.shop_shipping_addresses(user_id);
create unique index shop_shipping_addresses_one_default on public.shop_shipping_addresses(user_id) where is_default;
alter table public.shop_shipping_addresses enable row level security;
revoke all on public.shop_shipping_addresses from anon, authenticated;
grant select, insert, update, delete on public.shop_shipping_addresses to authenticated, service_role;
create policy shop_addresses_read_own on public.shop_shipping_addresses for select to authenticated
  using ((select auth.uid()) = user_id);
create policy shop_addresses_insert_own on public.shop_shipping_addresses for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy shop_addresses_update_own on public.shop_shipping_addresses for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy shop_addresses_delete_own on public.shop_shipping_addresses for delete to authenticated
  using ((select auth.uid()) = user_id);

-- SECURITY INVOKER preserves RLS. The owner comes only from the verified JWT.
-- A per-user transaction lock makes default changes atomic under concurrent saves.
create function public.shop_save_shipping_address(
  address_id uuid, recipient_name text, recipient_phone text, line_one text,
  line_two text, address_city text, address_state text, zip_code text, make_default boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  saved public.shop_shipping_addresses;
  has_address boolean;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 7300));
  if address_id is not null and not exists (select 1 from public.shop_shipping_addresses where id = address_id and user_id = owner_id) then
    raise exception 'Address not found' using errcode = '42501';
  end if;
  select exists (select 1 from public.shop_shipping_addresses where user_id = owner_id) into has_address;
  -- Retain the default when its existing record is edited without the checkbox.
  make_default := coalesce(make_default, false) or not has_address or exists (
    select 1 from public.shop_shipping_addresses where id = address_id and user_id = owner_id and is_default
  );
  if make_default then update public.shop_shipping_addresses set is_default = false, updated_at = now() where user_id = owner_id and is_default; end if;
  if address_id is null then
    insert into public.shop_shipping_addresses(user_id, name, phone, address1, address2, city, state, postal_code, is_default)
    values(owner_id, trim(recipient_name), trim(recipient_phone), trim(line_one), coalesce(trim(line_two), ''), trim(address_city), upper(trim(address_state)), trim(zip_code), make_default)
    returning * into saved;
  else
    update public.shop_shipping_addresses set name = trim(recipient_name), phone = trim(recipient_phone),
      address1 = trim(line_one), address2 = coalesce(trim(line_two), ''), city = trim(address_city),
      state = upper(trim(address_state)), postal_code = trim(zip_code), is_default = make_default, updated_at = now()
    where id = address_id and user_id = owner_id returning * into saved;
  end if;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.shop_save_shipping_address(uuid,text,text,text,text,text,text,text,boolean) from public, anon;
grant execute on function public.shop_save_shipping_address(uuid,text,text,text,text,text,text,text,boolean) to authenticated;

create function public.shop_delete_shipping_address(address_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  was_default boolean;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 7300));
  select is_default into was_default from public.shop_shipping_addresses where id = address_id and user_id = owner_id;
  if not found then return false; end if;
  delete from public.shop_shipping_addresses where id = address_id and user_id = owner_id;
  if was_default then
    update public.shop_shipping_addresses set is_default = true, updated_at = now()
    where id = (select id from public.shop_shipping_addresses where user_id = owner_id order by created_at desc, id desc limit 1);
  end if;
  return true;
end;
$$;
revoke all on function public.shop_delete_shipping_address(uuid) from public, anon;
grant execute on function public.shop_delete_shipping_address(uuid) to authenticated;
