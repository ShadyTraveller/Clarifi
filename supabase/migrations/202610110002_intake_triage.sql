-- Intake-to-triage workflow (Phase 2, workflows 1+2).
--
-- Adds triage decision tracking to jobs and an atomic triage RPC.
-- Flow: intake creates lead → triage decides → estimate | active | needs_review.
--
-- Triage decisions:
--   'estimate_needed' → job.status = 'estimate' (handoff to estimate-generator)
--   'direct_job'      → job.status = 'active'   (handoff to scheduling-dispatch)
--   'needs_review'    → job.status stays 'lead' (office must decide manually)
--
-- Rules (from request-triage agent spec):
-- - Direct jobs require EXPLICIT customer authorization + pricing certainty
--   + dispatch readiness. Record the authorization evidence.
-- - Ambiguous cases stay 'needs_review'. Never auto-convert to billable.

-- Triage columns on jobs.
alter table public.jobs
  add column if not exists triage_status text
    check (triage_status in ('pending', 'estimate_needed', 'direct_job', 'needs_review'))
    not null default 'pending',
  add column if not exists triage_decided_at timestamptz,
  add column if not exists triage_decided_by uuid references auth.users(id) on delete set null,
  add column if not exists triage_notes text,
  add column if not exists triage_authorization text;

comment on column public.jobs.triage_status is
  'Triage decision: pending (untriaged), estimate_needed, direct_job, needs_review.';
comment on column public.jobs.triage_authorization is
  'Evidence of explicit customer authorization (required for direct_job). E.g. "Customer approved $250 via email 2026-10-11".';

-- Atomic triage RPC. Office staff only.
-- p_decision: 'estimate_needed' | 'direct_job' | 'needs_review'
-- For 'direct_job', p_authorization is REQUIRED (explicit customer auth).
create or replace function public.triage_request(
  p_job_id uuid,
  p_decision text,
  p_notes text default null,
  p_authorization text default null,
  p_expected_updated_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_current_status text;
  v_current_updated_at timestamptz;
  v_caller_uid uuid;
  v_new_status text;
begin
  -- Validate decision.
  if p_decision not in ('estimate_needed', 'direct_job', 'needs_review') then
    raise exception 'Invalid triage decision: %', p_decision using errcode = '22000';
  end if;

  -- Authorization: active office staff only.
  v_caller_uid := auth.uid();
  if v_caller_uid is null then
    raise exception 'Not authorized: sign-in required' using errcode = '42501';
  end if;

  select organization_id, status, updated_at
    into v_org, v_current_status, v_current_updated_at
  from public.jobs where id = p_job_id;

  if v_org is null then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;

  if not private.is_office_member(v_org) then
    raise exception 'Not authorized: office staff only' using errcode = '42501';
  end if;

  -- Only triage leads (or re-triage needs_review).
  if v_current_status not in ('lead') then
    raise exception 'Can only triage leads (current: %)', v_current_status
      using errcode = 'P0002';
  end if;

  -- Stale-update rejection (if caller provided expected timestamp).
  if p_expected_updated_at is not null
     and v_current_updated_at != p_expected_updated_at then
    raise exception 'Stale: job was modified since you read it. Refresh and retry.'
      using errcode = 'P0003';
  end if;

  -- Direct jobs REQUIRE explicit customer authorization evidence.
  if p_decision = 'direct_job'
     and (p_authorization is null or btrim(p_authorization) = '') then
    raise exception 'Direct jobs require explicit customer authorization evidence'
      using errcode = '22000';
  end if;

  -- Map decision to status.
  v_new_status := case p_decision
    when 'estimate_needed' then 'estimate'
    when 'direct_job' then 'active'
    when 'needs_review' then 'lead'  -- stays lead, flagged for office
  end;

  update public.jobs
  set status = v_new_status,
      triage_status = p_decision,
      triage_decided_at = now(),
      triage_decided_by = v_caller_uid,
      triage_notes = p_notes,
      triage_authorization = case
        when p_decision = 'direct_job' then p_authorization
        else null
      end,
      updated_at = now()
  where id = p_job_id;

  return p_job_id;
end;
$$;

grant execute on function public.triage_request(uuid, text, text, text, timestamptz)
  to authenticated;

comment on function public.triage_request(uuid, text, text, text, timestamptz) is
  'Atomic triage: office-only, requires auth evidence for direct jobs, rejects stale updates.';
