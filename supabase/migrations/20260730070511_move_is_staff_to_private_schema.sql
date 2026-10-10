-- Keep the staff-role lookup available to RLS without exposing a privileged
-- function through the public Data API schema.

create schema if not exists private;

create or replace function private.is_staff()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.staff_roles
    where user_id = (select auth.uid())
  );
$$;

comment on function private.is_staff() is
  'Internal RLS helper that checks whether the current authenticated user has a staff role.';

revoke all on function private.is_staff() from public;
grant execute on function private.is_staff() to anon, authenticated;

-- Preserve every existing policy expression while moving only the helper
-- reference. The expected count protects against silently missing a policy
-- when production and repository migration histories have drifted.
do $$
declare
  policy_record record;
  using_expression text;
  check_expression text;
  updated_policy_count integer := 0;
begin
  for policy_record in
    select
      policy.oid,
      namespace.nspname as schema_name,
      relation.relname as table_name,
      policy.polname as policy_name,
      pg_get_expr(policy.polqual, policy.polrelid) as using_expression,
      pg_get_expr(policy.polwithcheck, policy.polrelid) as check_expression
    from pg_policy as policy
    join pg_class as relation on relation.oid = policy.polrelid
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and (
        coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') like '%is_staff()%'
        or coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '') like '%is_staff()%'
      )
    order by relation.relname, policy.polname
  loop
    using_expression := policy_record.using_expression;
    check_expression := policy_record.check_expression;

    if using_expression is not null then
      using_expression := case
        when position('public.is_staff()' in using_expression) > 0
          then replace(using_expression, 'public.is_staff()', 'private.is_staff()')
        else replace(using_expression, 'is_staff()', 'private.is_staff()')
      end;
    end if;

    if check_expression is not null then
      check_expression := case
        when position('public.is_staff()' in check_expression) > 0
          then replace(check_expression, 'public.is_staff()', 'private.is_staff()')
        else replace(check_expression, 'is_staff()', 'private.is_staff()')
      end;
    end if;

    execute format(
      'alter policy %I on %I.%I%s%s',
      policy_record.policy_name,
      policy_record.schema_name,
      policy_record.table_name,
      case
        when using_expression is null then ''
        else format(' using (%s)', using_expression)
      end,
      case
        when check_expression is null then ''
        else format(' with check (%s)', check_expression)
      end
    );

    updated_policy_count := updated_policy_count + 1;
  end loop;

  if updated_policy_count <> 38 then
    raise exception
      'Expected to update 38 is_staff RLS policies, updated % instead',
      updated_policy_count;
  end if;
end;
$$;

-- This drop is also a dependency check: PostgreSQL will reject and roll back
-- the migration if any policy still references the public helper.
drop function public.is_staff();
