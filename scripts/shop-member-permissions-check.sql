-- Verification only: transaction is ALWAYS rolled back, with no existing table writes.
-- Requires two existing identities with no commerce addresses/orders. Their IDs
-- stay inside transaction-local settings and are never returned.
begin;
do $$
declare identities uuid[];
begin
  select array_agg(id) into identities from (
    select u.id from auth.users u
    where not exists (select 1 from public.shop_shipping_addresses a where a.user_id = u.id)
      and not exists (select 1 from public.shop_member_orders o where o.user_id = u.id)
    order by u.id limit 2
  ) candidates;
  if coalesce(array_length(identities, 1), 0) <> 2 then raise exception 'Two unused commerce identities required'; end if;
  perform set_config('shop_test.owner_one', identities[1]::text, true);
  perform set_config('shop_test.owner_two', identities[2]::text, true);
  insert into public.shop_member_orders(id,user_id,order_number,status,subtotal_cents,total_cents,items,created_at,updated_at)
  values
    ('ord_permission_check_one',identities[1],'PERMISSION-CHECK-ONE','pending',0,0,'[{"id":"test","name":{"en":"Test","zh":"测试"},"variant":{"en":"","zh":""},"image":"","quantity":1,"unitPriceCents":0,"totalCents":0}]',now(),now()),
    ('ord_permission_check_two',identities[2],'PERMISSION-CHECK-TWO','pending',0,0,'[{"id":"test","name":{"en":"Test","zh":"测试"},"variant":{"en":"","zh":""},"image":"","quantity":1,"unitPriceCents":0,"totalCents":0}]',now(),now());
  insert into public.shop_shipping_addresses(id,user_id,name,phone,address1,city,state,postal_code)
    values('60000000-0000-4000-8000-000000000002',identities[2],'Permission check','5550101000','123 Example Street','Los Angeles','CA','90001');
  if has_table_privilege('anon','public.shop_member_orders','select')
    or has_table_privilege('anon','public.shop_shipping_addresses','select') then
    raise exception 'Anonymous commerce read privilege unexpectedly present';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('shop_save_shipping_address','shop_delete_shipping_address')
      and (p.prosecdef or has_function_privilege('anon',p.oid,'execute'))
  ) then raise exception 'Address RPC is privileged or anonymously callable'; end if;
  perform set_config('request.jwt.claims',json_build_object('sub',identities[1],'role','authenticated')::text,true);
end;
$$;
set local role authenticated;
do $$
declare
  first_address uuid;
  second_address uuid;
  saved jsonb;
  affected integer;
begin
  if (select count(*) from public.shop_member_orders) <> 1 then raise exception 'Owner order SELECT isolation failed'; end if;
  if exists (select 1 from public.shop_member_orders where id = 'ord_permission_check_two') then raise exception 'Foreign order visible'; end if;
  if exists (select 1 from public.shop_shipping_addresses) then raise exception 'Foreign address visible'; end if;
  begin
    update public.shop_member_orders set total_cents = 100 where id = 'ord_permission_check_one';
    raise exception 'Member order UPDATE unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.shop_member_orders where id = 'ord_permission_check_one';
    raise exception 'Member order DELETE unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.shop_shipping_addresses(user_id,name,phone,address1,city,state,postal_code)
      values(current_setting('shop_test.owner_two')::uuid,'Test','5550101000','123 Example Street','Los Angeles','CA','90001');
    raise exception 'Foreign address INSERT unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  saved := public.shop_save_shipping_address(null,'Permission check','5550101000','123 Example Street','','Los Angeles','ca','90001',false);
  first_address := (saved->>'id')::uuid;
  if not (saved->>'is_default')::boolean then raise exception 'First address must default'; end if;
  if saved->>'user_id' <> current_setting('shop_test.owner_one') then raise exception 'RPC owner mismatch'; end if;
  saved := public.shop_save_shipping_address(null,'Permission check 2','5550101000','456 Example Street','','Los Angeles','CA','90002',true);
  second_address := (saved->>'id')::uuid;
  if (select count(*) from public.shop_shipping_addresses where is_default) <> 1
    or not exists (select 1 from public.shop_shipping_addresses where id = second_address and is_default) then
    raise exception 'Default switch failed';
  end if;
  begin
    perform public.shop_save_shipping_address(null,'Bad ZIP','5550101000','Bad','','Los Angeles','CA','invalid',true);
    raise exception 'Invalid ZIP unexpectedly saved';
  exception when check_violation then null;
  end;
  if not exists (select 1 from public.shop_shipping_addresses where id = second_address and is_default) then
    raise exception 'Failed save lost previous default';
  end if;
  saved := public.shop_save_shipping_address(second_address,'Edited','5550101000','456 Example Street','','Pasadena','CA','90002',false);
  if not (saved->>'is_default')::boolean or saved->>'city' <> 'Pasadena' then raise exception 'Default edit failed'; end if;
  begin
    perform public.shop_save_shipping_address('60000000-0000-4000-8000-000000000002','Foreign','5550101000','Bad','','Los Angeles','CA','90001',true);
    raise exception 'Foreign RPC edit unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  if public.shop_delete_shipping_address('60000000-0000-4000-8000-000000000002') then raise exception 'Foreign RPC deletion allowed'; end if;
  update public.shop_shipping_addresses set city = 'Foreign write' where id = '60000000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Foreign direct UPDATE allowed'; end if;
  begin
    update public.shop_shipping_addresses set user_id = current_setting('shop_test.owner_two')::uuid where id = first_address;
    raise exception 'Address owner reassignment allowed';
  exception when insufficient_privilege then null;
  end;
  if not public.shop_delete_shipping_address(second_address) then raise exception 'Own RPC delete failed'; end if;
  if not exists (select 1 from public.shop_shipping_addresses where id = first_address and is_default) then
    raise exception 'Deleting default did not choose replacement';
  end if;
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('shop_test.owner_two'),'role','authenticated','app_metadata',json_build_object('role','admin'))::text,true);
  if (select count(*) from public.shop_member_orders) <> 1
    or exists (select 1 from public.shop_member_orders where id = 'ord_permission_check_one') then
    raise exception 'Second member or forged metadata bypassed order RLS';
  end if;
end;
$$;
reset role;
set local role anon;
do $$
begin
  begin
    perform id from public.shop_member_orders;
    raise exception 'Anonymous order read unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.shop_delete_shipping_address('60000000-0000-4000-8000-000000000002');
    raise exception 'Anonymous address RPC unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
set local role service_role;
do $$
begin
  if (select count(*) from public.shop_member_orders where id in ('ord_permission_check_one','ord_permission_check_two')) <> 2 then raise exception 'Backend order read failed'; end if;
end;
$$;
reset role;
rollback;
select
  not exists (select 1 from public.shop_member_orders where id in ('ord_permission_check_one','ord_permission_check_two')) as fixture_orders_rolled_back,
  not exists (select 1 from public.shop_shipping_addresses where id = '60000000-0000-4000-8000-000000000002' or name in ('Permission check','Permission check 2','Edited')) as fixture_addresses_rolled_back,
  'All ownership, privilege, default-address and rollback assertions passed' as verification;
