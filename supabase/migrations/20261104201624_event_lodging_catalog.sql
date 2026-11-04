-- Draft catalog only. Sales cannot be enabled until inventory/payment migrations land.
create table public.lodging_properties (
 id uuid primary key default gen_random_uuid(),
 name jsonb not null check(coalesce(jsonb_typeof(name)='object' and jsonb_typeof(name->'en')='string' and jsonb_typeof(name->'zh')='string' and length(trim(name->>'en'))>0 and length(trim(name->>'zh'))>0,false)),
 address text not null check(length(trim(address))>0),
 timezone text not null,
 photo_url text not null default '' check(photo_url='' or photo_url like 'https://%'),
 version integer not null default 1 check(version>0),
 updated_by uuid not null,
 created_at timestamptz not null default now()
);
create table public.lodging_room_types (
 id uuid primary key default gen_random_uuid(),
 property_id uuid not null references public.lodging_properties(id) on delete restrict,
 name jsonb not null check(coalesce(jsonb_typeof(name)='object' and jsonb_typeof(name->'en')='string' and jsonb_typeof(name->'zh')='string' and length(trim(name->>'en'))>0 and length(trim(name->>'zh'))>0,false)),
 beds jsonb not null check(coalesce(jsonb_typeof(beds)='object' and jsonb_typeof(beds->'en')='string' and jsonb_typeof(beds->'zh')='string' and length(trim(beds->>'en'))>0 and length(trim(beds->>'zh'))>0,false)),
 max_guests integer not null check(max_guests between 1 and 30),
 version integer not null default 1 check(version>0),
 updated_by uuid not null,
 created_at timestamptz not null default now()
);
create index lodging_room_property_idx on public.lodging_room_types(property_id);
create table public.event_lodging_offers (
 id uuid primary key default gen_random_uuid(),
 event_slug text not null references public.events(slug) on delete restrict,
 room_type_id uuid not null references public.lodging_room_types(id) on delete restrict,
 check_in date not null, check_out date not null,
 nightly_amount integer not null check(nightly_amount between 0 and 100000000),
 mandatory_fee integer not null check(mandatory_fee between 0 and 100000000),
 tax_basis_points integer not null check(tax_basis_points between 0 and 10000),
 currency text not null default 'usd' check(currency='usd'),
 policy jsonb not null check(coalesce(jsonb_typeof(policy)='object' and jsonb_typeof(policy->'en')='string' and jsonb_typeof(policy->'zh')='string' and length(trim(policy->>'en'))>0 and length(trim(policy->>'zh'))>0,false)),
 sales_enabled boolean not null default false check(sales_enabled=false),
 version integer not null default 1 check(version>0),
 updated_by uuid not null,
 created_at timestamptz not null default now(),
 check(check_out > check_in and check_out-check_in<=30),
 unique(event_slug,room_type_id,check_in,check_out)
);
create index event_lodging_event_idx on public.event_lodging_offers(event_slug);
create index event_lodging_room_idx on public.event_lodging_offers(room_type_id);
create table public.lodging_catalog_audit (
 id uuid primary key default gen_random_uuid(),
 entity_table text not null, entity_id uuid not null,
 actor uuid not null, old_row jsonb, new_row jsonb not null,
 created_at timestamptz not null default now()
);
create function public.audit_lodging_catalog() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='lodging_properties' and not exists(select 1 from pg_catalog.pg_timezone_names where name=to_jsonb(new)->>'timezone') then
 raise exception 'Invalid hotel time zone';
 end if;
 insert into public.lodging_catalog_audit(entity_table,entity_id,actor,old_row,new_row)
 values(tg_table_name,new.id,new.updated_by,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end;$$;
revoke all on function public.audit_lodging_catalog() from public,anon,authenticated;
grant execute on function public.audit_lodging_catalog() to service_role;
create trigger lodging_property_audit after insert or update on public.lodging_properties for each row execute function public.audit_lodging_catalog();
create trigger lodging_room_audit after insert or update on public.lodging_room_types for each row execute function public.audit_lodging_catalog();
create trigger lodging_offer_audit after insert or update on public.event_lodging_offers for each row execute function public.audit_lodging_catalog();
alter table public.lodging_properties enable row level security;
alter table public.lodging_room_types enable row level security;
alter table public.event_lodging_offers enable row level security;
alter table public.lodging_catalog_audit enable row level security;
revoke all on public.lodging_properties,public.lodging_room_types,public.event_lodging_offers,public.lodging_catalog_audit from public,anon,authenticated;
grant select,insert,update on public.lodging_properties,public.lodging_room_types,public.event_lodging_offers to service_role;
grant select,insert on public.lodging_catalog_audit to service_role;
