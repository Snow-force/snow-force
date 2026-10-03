-- Private SnowForce application/review ledger. Native Medusa owns stock, returns and money.
create table commerce.snowforce_after_sales (
  id uuid primary key,
  order_id text not null references commerce."order"(id),
  customer_id text not null references commerce.customer(id),
  member_id uuid not null,
  kind text not null check (kind in ('return','exchange')),
  reason text not null check (reason in ('size','quality','incorrect','other')),
  description text not null check (length(description) between 5 and 2000),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 100),
  status text not null default 'pending' check (status in ('pending','approved','processing','completed','rejected','cancelled')),
  version integer not null default 1 check (version > 0),
  customer_message text not null default '' check (length(customer_message) <= 2000),
  internal_note text not null default '' check (length(internal_note) <= 4000),
  native_id text unique check (native_id is null or native_id ~ '^(return|oexc)_[A-Za-z0-9]+$'),
  return_carrier text not null default '' check (length(return_carrier) <= 100),
  return_tracking_number text not null default '' check (length(return_tracking_number) <= 200),
  reviewed_by text,
  reviewed_at timestamptz,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index snowforce_after_sales_active_order on commerce.snowforce_after_sales(order_id)
  where status in ('pending','approved','processing');
create index snowforce_after_sales_customer on commerce.snowforce_after_sales(customer_id,order_id,created_at desc);
create index snowforce_after_sales_review_queue on commerce.snowforce_after_sales(status,created_at desc);

create function commerce.guard_after_sales_request() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare line jsonb; seen text[] := '{}';
begin
  for line in select value from jsonb_array_elements(new.items) loop
    if jsonb_typeof(line) <> 'object' or not (line ? 'id' and line ? 'quantity')
      or (select count(*) from jsonb_object_keys(line)) <> 2
      or jsonb_typeof(line->'id') <> 'string' or line->>'id' !~ '^ordli_[A-Za-z0-9]+$'
      or jsonb_typeof(line->'quantity') <> 'number' or (line->>'quantity')::numeric not between 1 and 10000
      or (line->>'quantity')::numeric <> trunc((line->>'quantity')::numeric)
      or line->>'id' = any(seen) then raise exception 'Invalid request items' using errcode='23514'; end if;
    seen := array_append(seen,line->>'id');
  end loop;
  if tg_op = 'UPDATE' then
    if (new.id,new.order_id,new.customer_id,new.member_id,new.kind,new.reason,new.description,new.items,new.created_at)
      is distinct from (old.id,old.order_id,old.customer_id,old.member_id,old.kind,old.reason,old.description,old.items,old.created_at)
      or new.version <> old.version + 1
      or (old.native_id is not null and new.native_id is distinct from old.native_id)
      then raise exception 'Immutable request or stale version' using errcode='23514'; end if;
    if new.status <> old.status and not (
      (old.status='pending' and new.status in ('approved','rejected','cancelled')) or
      (old.status='approved' and new.status='processing') or
      (old.status='processing' and new.status='completed')) then
      raise exception 'Invalid request transition' using errcode='23514'; end if;
    new.history := old.history;
    if new.status <> old.status or new.customer_message <> old.customer_message then
      new.history := old.history || jsonb_build_array(jsonb_build_object('status',new.status,'message',new.customer_message,'at',clock_timestamp()));
    end if;
    new.updated_at := clock_timestamp();
  else
    if new.status <> 'pending' or new.version <> 1 or new.native_id is not null then
      raise exception 'Requests must start pending' using errcode='23514'; end if;
    new.history := jsonb_build_array(jsonb_build_object('status','pending','message','','at',new.created_at));
  end if;
  return new;
end $$;
create trigger guard_snowforce_after_sales before insert or update on commerce.snowforce_after_sales
  for each row execute function commerce.guard_after_sales_request();

alter table commerce.snowforce_after_sales owner to snowforce_commerce;
alter function commerce.guard_after_sales_request() owner to snowforce_commerce;
alter table commerce.snowforce_after_sales enable row level security;
revoke all on commerce.snowforce_after_sales from public, anon, authenticated, service_role;
revoke all on function commerce.guard_after_sales_request() from public, anon, authenticated, service_role;
grant execute on function commerce.guard_after_sales_request() to snowforce_commerce;
comment on table commerce.snowforce_after_sales is 'Private application and review records; inventory and financial execution stay in native Medusa workflows.';
