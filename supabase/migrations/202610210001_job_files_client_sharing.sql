-- 202610210001_job_files_client_sharing.sql
-- Per-file client sharing for job_files (Job Report page, Billdr-style preview).
-- client_visible defaults to false: every existing and new file stays
-- office-only until the office explicitly shares it with the client.
-- caption gives uploaded photos/documents a real caption (the report page
-- previously had to fall back to the file name).
-- Idempotent: safe to run more than once.

alter table public.job_files
  add column if not exists client_visible boolean not null default false;

alter table public.job_files
  add column if not exists caption text;
