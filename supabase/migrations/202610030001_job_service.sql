-- Clarifi services catalog: tag each job with one of the five services.
alter table public.jobs add column if not exists service text;
