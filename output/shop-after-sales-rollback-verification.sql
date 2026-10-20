-- Scoped verification only. All fixture rows are rolled back; no Stripe/native events run.
begin;
set local role snowforce_commerce;
insert into commerce.customer(id) values ('cus_afterSalesRollback');
insert into commerce."order"(id,currency_code,customer_id) values ('order_afterSalesRollback','usd','cus_afterSalesRollback');
insert into commerce.snowforce_after_sales(id,order_id,customer_id,member_id,kind,reason,description,items)
values ('12345678-1234-4234-8234-123456789001','order_afterSalesRollback','cus_afterSalesRollback','12345678-1234-4234-8234-123456789000','return','size','Rollback fixture only','[{"id":"ordli_afterSalesRollback","quantity":1}]');
do $$ begin
  if (select jsonb_array_length(history) from commerce.snowforce_after_sales where id='12345678-1234-4234-8234-123456789001')<>1 then raise exception 'Initial audit missing'; end if;
  begin
    insert into commerce.snowforce_after_sales(id,order_id,customer_id,member_id,kind,reason,description,items)
    values ('12345678-1234-4234-8234-123456789002','order_afterSalesRollback','cus_afterSalesRollback','12345678-1234-4234-8234-123456789000','return','size','Rollback fixture only','[{"id":"ordli_afterSalesRollback","quantity":1}]');
    raise exception 'Duplicate active order allowed';
  exception when unique_violation then null; end;
  begin
    update commerce.snowforce_after_sales set member_id='12345678-1234-4234-8234-123456789009',version=2 where id='12345678-1234-4234-8234-123456789001';
    raise exception 'Owner reassignment allowed';
  exception when check_violation then null; end;
  begin
    update commerce.snowforce_after_sales set status='completed',version=2 where id='12345678-1234-4234-8234-123456789001';
    raise exception 'Review bypass allowed';
  exception when check_violation then null; end;
  begin
    update commerce.snowforce_after_sales set version=1,customer_message='Stale' where id='12345678-1234-4234-8234-123456789001';
    raise exception 'Stale version allowed';
  exception when check_violation then null; end;
  update commerce.snowforce_after_sales set status='approved',version=2,customer_message='Fixture instructions',internal_note='Never expose this note',reviewed_by='user_fixture',reviewed_at=now() where id='12345678-1234-4234-8234-123456789001';
  if (select jsonb_array_length(history)<>2 or history::text like '%Never expose this note%' from commerce.snowforce_after_sales where id='12345678-1234-4234-8234-123456789001') then raise exception 'Invalid public history'; end if;
end $$;
set local role anon;
do $$ begin
  begin perform id from commerce.snowforce_after_sales; raise exception 'Anonymous read allowed'; exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
do $$ begin
  begin perform id from commerce.snowforce_after_sales; raise exception 'Member direct read allowed'; exception when insufficient_privilege then null; end;
end $$;
set local role service_role;
do $$ begin
  begin perform id from commerce.snowforce_after_sales; raise exception 'Root API role direct read allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
