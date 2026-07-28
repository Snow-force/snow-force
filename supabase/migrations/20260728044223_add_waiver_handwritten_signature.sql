alter table public.waiver_acceptances
  add column if not exists handwritten_signature_data_url text;

alter table public.pending_registrations
  add column if not exists handwritten_signature_data_url text;

comment on column public.waiver_acceptances.handwritten_signature_data_url is
  'PNG data URL snapshot of the participant handwritten waiver signature.';
