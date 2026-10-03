-- Commerce runs inside the existing database. This migration creates no products,
-- orders, customers, or stock, and never changes existing application tables.
-- The NOLOGIN role is activated only by the local credential configuration helper.
do $foundation$
begin
  if exists (select 1 from pg_roles where rolname = 'snowforce_commerce') then
    raise exception 'Commerce role already exists; inspect before applying this foundation';
  end if;
  if exists (select 1 from pg_namespace where nspname = 'commerce') then
    raise exception 'Commerce schema already exists; inspect before applying this foundation';
  end if;
end
$foundation$;

create role snowforce_commerce nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant snowforce_commerce to postgres;
grant connect on database postgres to snowforce_commerce;
create schema commerce authorization snowforce_commerce;
revoke all on schema commerce from public, anon, authenticated, service_role;
alter role snowforce_commerce set search_path to commerce;

alter default privileges for role snowforce_commerce in schema commerce
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role snowforce_commerce in schema commerce
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role snowforce_commerce in schema commerce
  revoke all on functions from public, anon, authenticated, service_role;

do $scope_check$
begin
  if has_schema_privilege('snowforce_commerce', 'public', 'CREATE')
     or has_schema_privilege('snowforce_commerce', 'auth', 'CREATE') then
    raise exception 'Commerce role can create outside commerce; inspect inherited grants before continuing';
  end if;
end
$scope_check$;

comment on schema commerce is 'SnowForce Medusa commerce core; private server access only, same existing Supabase database';
