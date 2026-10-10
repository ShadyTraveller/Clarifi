-- Dedupe support for agent-created requests: stamp each request with an
-- idempotency key (e.g. the Gmail message id) so reprocessing the same
-- inbound message returns the existing job instead of creating a duplicate.
alter table public.jobs
  add column if not exists source_ref text;

create index if not exists jobs_org_source_ref_idx
  on public.jobs (organization_id, source_ref)
  where source_ref is not null;

comment on column public.jobs.source_ref is
  'Idempotency key for agent-created requests (e.g. gmail:<message_id>). The requests route returns the existing job when this repeats.';
