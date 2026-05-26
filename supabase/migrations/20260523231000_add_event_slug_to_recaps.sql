-- Add event_slug column to link recaps back to their source event
alter table event_recaps add column if not exists event_slug text;
