alter table public.events
  add column if not exists summary_zh text not null default '',
  add column if not exists summary_en text not null default '';

-- The aggregate RPC predates the summary columns. Extend its JSON core mapping
-- without changing its signature or the single-RPC save contract.
do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.save_event_aggregate(jsonb, jsonb, jsonb, jsonb)'::regprocedure)
  into definition;

  definition := replace(definition, E'    title_en,\n    event_date,', E'    title_en,\n    summary_zh,\n    summary_en,\n    event_date,');
  definition := replace(definition, E'    core.title_en,\n    core.event_date,', E'    core.title_en,\n    core.summary_zh,\n    core.summary_en,\n    core.event_date,');
  definition := replace(definition, E'    title_en text,\n    event_date date,', E'    title_en text,\n    summary_zh text,\n    summary_en text,\n    event_date date,');
  definition := replace(definition, E'        title_en = excluded.title_en,\n        event_date = excluded.event_date,', E'        title_en = excluded.title_en,\n        summary_zh = excluded.summary_zh,\n        summary_en = excluded.summary_en,\n        event_date = excluded.event_date,');

  execute definition;
end;
$$;
