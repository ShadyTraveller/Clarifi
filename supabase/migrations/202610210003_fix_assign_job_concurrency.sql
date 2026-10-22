-- 202610210003_fix_assign_job_concurrency.sql
-- P1 fix (audit 2026-10-21): close the assign_job stale-update race.
--
-- What was wrong:
-- 1. assign_job read the job's updated_at WITHOUT locking the row, then
--    updated by job id alone. Two callers reassigning the same job to
--    different technicians both read the same version and both passed the
--    stale check (the advisory lock is per-technician, so they never
--    blocked each other): a silent lost update.
-- 2. The stale check used `!=`, so a NULL expected version never rejected.
--
-- What this migration does (function body diff-verified against
-- 202610110001; only the two regions below change):
-- 1. The initial read now takes the job row lock (FOR UPDATE), which
--    serializes every concurrent write to the job; a waiting caller then
--    re-reads the newest committed version, so the stale check is real.
-- 2. A NULL expected version is rejected (P0003), and the comparison uses
--    IS DISTINCT FROM.
--
-- CONTRACT CHANGE: callers must pass the job's current updated_at as
-- p_expected_updated_at. Passing NULL now fails with P0003 instead of
-- silently succeeding. (Per the stabilization audit: "require the
-- expected revision.")
--
-- Privileges are unchanged: CREATE OR REPLACE preserves the ACL set by
-- 202610210002 (authenticated + service_role; PUBLIC/anon revoked).
-- Idempotent: re-running is safe. No data is changed.

create or replace function public.assign_job(
  p_job_id uuid,
  p_technician_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_current_updated_at timestamptz;
  v_conflict uuid;
  v_caller_uid uuid;
begin
  -- Authorization: active office staff only.
  v_caller_uid := auth.uid();
  if v_caller_uid is null then
    raise exception 'Not authorized: sign-in required' using errcode = '42501';
  end if;

  -- Lock the job row before anything else: this serializes all concurrent
  -- writes to THIS job. The per-technician advisory lock further down only
  -- serializes one technician's calendar, so two callers reassigning the
  -- same job to different technicians previously never blocked each other
  -- and both passed the stale check on the same version (lost update).
  -- With the row locked, a waiting caller re-reads the newest committed
  -- version once it proceeds, so the stale check below sees fresh data.
  select organization_id, updated_at into v_org, v_current_updated_at
  from public.jobs where id = p_job_id
  for update;
  if v_org is null then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;

  if not private.is_office_member(v_org) then
    raise exception 'Not authorized: office staff only' using errcode = '42501';
  end if;

  -- Stale-update rejection: the caller must present the current version.
  -- A NULL expected version is rejected outright (previously `!=` let it
  -- pass silently, because a comparison with NULL is never true).
  if p_expected_updated_at is null then
    raise exception 'Stale: expected job version is required. Refresh and retry.'
      using errcode = 'P0003';
  end if;
  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception 'Stale: job was modified since you read it. Refresh and retry.'
      using errcode = 'P0003';
  end if;

  -- Time window sanity.
  if p_start is null or p_end is null or p_end <= p_start then
    raise exception 'Invalid time window' using errcode = '22000';
  end if;

  -- Verify technician belongs to this org and is active.
  if p_technician_id is not null then
    if not exists (
      select 1 from public.technicians t
      where t.id = p_technician_id
        and t.organization_id = v_org
        and t.active = true
    ) then
      raise exception 'Technician not found or inactive in this organization'
        using errcode = 'P0002';
    end if;

    -- Serialize concurrent assignments for this technician.
    -- Without this, two transactions could both pass the overlap check
    -- below and create conflicting assignments.
    perform pg_advisory_xact_lock(hashtext('tech-assign|' || p_technician_id::text));

    -- Overlap check: no other non-completed job for this tech in [p_start, p_end).
    -- Note: project_status enum is ('lead','active','estimate','completed') —
    -- there is no 'cancelled' value.
    select j.id into v_conflict
    from public.jobs j
    where j.technician_id = p_technician_id
      and j.id != p_job_id
      and j.status != 'completed'
      and j.scheduled_start is not null
      and j.scheduled_end is not null
      and j.scheduled_start < p_end
      and j.scheduled_end > p_start
    limit 1;
    if v_conflict is not null then
      raise exception 'Overlap: technician already assigned to job % in this window', v_conflict
        using errcode = 'P0004';
    end if;
  end if;

  update public.jobs
  set technician_id = p_technician_id,
      scheduled_start = p_start,
      scheduled_end = p_end,
      updated_at = now()
  where id = p_job_id;

  return p_job_id;
end;
$$;
