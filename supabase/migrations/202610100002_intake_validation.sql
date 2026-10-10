-- Intake validation: store geocoded coordinates (dispatch map) and the
-- validate-and-flag results (office visibility) on each job.
alter table public.jobs
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists validation jsonb not null default '{}'::jsonb;

comment on column public.jobs.latitude is
  'Geocoded latitude from Nominatim at intake (null when address not found).';
comment on column public.jobs.longitude is
  'Geocoded longitude from Nominatim at intake (null when address not found).';
comment on column public.jobs.validation is
  'Intake validation flags: { email: {...}, phone: {...}, address: {...} }. Warnings only — never blocks.';
