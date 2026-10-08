-- Yavamo AI agents backend (receptionist + warehouse).
-- New tables: agent_runs, email_intake_log, part_tracking, notifications.
-- Column additions on jobs and quotes for the assessment-fee flow and the
-- tech-marks-complete mistake-guard. Service role (server routes) bypasses
-- RLS; member policies mirror the job_events style so office users can read
-- the in-app notification queue.

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  summary jsonb not null default '{}'::jsonb
);

-- Email intake idempotency: one row per processed Gmail message per org.
create table if not exists public.email_intake_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  gmail_message_id text not null,
  gmail_thread_id text,
  from_addr text,
  subject text,
  classification text not null,
  action_taken text not null,
  job_id uuid references public.jobs(id) on delete set null,
  draft_id text,
  processed_at timestamptz not null default now(),
  unique (organization_id, gmail_message_id)
);

-- Warehouse: parts the office registered as ordered; the agent watches these.
create table if not exists public.part_tracking (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  part_name text not null,
  supplier text,
  tracking_number text not null,
  -- Stored values follow app/lib/agents/tracking.ts CarrierKey:
  -- 'canada-post' | 'purolator' | 'ups' | 'fedex' | 'amazon-logistics' | 'dragonfly' | 'unknown'.
  -- Map runbook-style variants on input: 'canadapost'→'canada-post', 'amazon'→'amazon-logistics'.
  carrier text not null default 'unknown',
  status text not null default 'unknown',
  eta_date date,
  last_event text,
  last_checked_at timestamptz,
  -- Optional registration extras (warehouse runbook §4): public CAD price
  -- source for the 20% margin audit, and OEM vs aftermarket flag.
  source_url text,
  oem_or_aftermarket text,
  unique (organization_id, tracking_number)
);

-- Office notification queue: rows are the in-app queue when Resend is
-- unconfigured (notify route falls back to inserting emailed=false).
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  email_to text,
  emailed boolean not null default false,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.agent_runs enable row level security;
alter table public.email_intake_log enable row level security;
alter table public.part_tracking enable row level security;
alter table public.notifications enable row level security;

do $$ begin
  create policy "members can read agent runs" on public.agent_runs
    for select to authenticated using (is_org_member(organization_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members can write agent runs" on public.agent_runs
    for all to authenticated using (is_org_member(organization_id))
    with check (is_org_member(organization_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members can read email intake log" on public.email_intake_log
    for select to authenticated using (is_org_member(organization_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members can write email intake log" on public.email_intake_log
    for all to authenticated using (is_org_member(organization_id))
    with check (is_org_member(organization_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members can read part tracking" on public.part_tracking
    for select to authenticated using (is_org_member(organization_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members can write part tracking" on public.part_tracking
    for all to authenticated using (is_org_member(organization_id))
    with check (is_org_member(organization_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members can read notifications" on public.notifications
    for select to authenticated using (is_org_member(organization_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members can write notifications" on public.notifications
    for all to authenticated using (is_org_member(organization_id))
    with check (is_org_member(organization_id));
exception when duplicate_object then null; end $$;

create index if not exists agent_runs_org_agent_idx
  on public.agent_runs (organization_id, agent, started_at desc);
create index if not exists email_intake_log_org_idx
  on public.email_intake_log (organization_id);
create index if not exists part_tracking_org_idx
  on public.part_tracking (organization_id);
create index if not exists notifications_org_queue_idx
  on public.notifications (organization_id, emailed, read);

-- Jobs: assessment-fee flow ($69) + mistake-guard timestamps.
alter table public.jobs add column if not exists assessment_fee_cents integer not null default 6900;
alter table public.jobs add column if not exists assessment_fee_status text not null default 'pending';
alter table public.jobs add column if not exists visit_started_at timestamptz;
alter table public.jobs add column if not exists completed_at timestamptz;
alter table public.jobs add column if not exists completion_reverted_at timestamptz;

do $$ begin
  alter table public.jobs add constraint jobs_assessment_fee_status_check
    check (assessment_fee_status in ('pending','collect_before_visit','invoiced','credited','waived'));
exception when duplicate_object then null; end $$;

-- Quotes: track whether the $69 assessment fee has been credited toward the
-- invoice on approval, and where the quote came from ('manual' | 'agent').
alter table public.quotes add column if not exists assessment_credited_cents integer not null default 0;
alter table public.quotes add column if not exists source text not null default 'manual';
