-- Backend for mobile contract §10: notes, scheduling, receipts, customer updates.
-- FIXED 2026-10-15: enum crash, atomicity, RLS, technician verification.
--
-- 1. job_notes: shared office/technician notes with author, visibility, and
--    unread acknowledgement (via job_note_reads). Office-only visibility is
--    enforced in RLS, not just app-side.
-- 2. assign_job RPC: atomic scheduling + assignment with overlap checks and
--    stale-update rejection. Advisory lock serializes concurrent assignments
--    for the same technician.
-- 3. warehouse_receipts: job-linked proof-of-delivery for tracked parts.
-- 4. customer_updates: customer-facing update lifecycle with distinct
--    sent / delivered / confirmed states, retry, and escalation.
--    An office notification is NEVER a customer update.

-- ============================================================
-- 1. Shared notes
-- ============================================================
create table if not exists public.job_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  body text not null,
  -- 'internal': office + assigned technician. 'office': office staff only.
  visibility text not null default 'internal'
    check (visibility in ('internal', 'office')),
  created_at timestamptz not null default now()
);

create table if not exists public.job_note_reads (
  note_id uuid not null references public.job_notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

alter table public.job_notes enable row level security;
alter table public.job_note_reads enable row level security;

-- Notes: office-only visibility enforced in RLS (not just app-side).
-- Technicians see 'internal' notes; office staff see all.
drop policy if exists "members can read job notes" on public.job_notes;
create policy "members can read job notes"
  on public.job_notes for select to authenticated
  using (
    private.is_org_member(organization_id)
    and (
      visibility = 'internal'
      or private.is_office_member(organization_id)
    )
  );

drop policy if exists "members can write job notes" on public.job_notes;
create policy "members can write job notes"
  on public.job_notes for insert to authenticated
  with check (
    private.is_org_member(organization_id)
    and (
      -- Technicians can only create 'internal' notes, not 'office'-only.
      visibility = 'internal'
      or private.is_office_member(organization_id)
    )
  );

drop policy if exists "authors can delete job notes" on public.job_notes;
create policy "authors can delete job notes"
  on public.job_notes for delete to authenticated
  using (private.is_org_member(organization_id) and author_user_id = auth.uid());

drop policy if exists "members can read note reads" on public.job_note_reads;
create policy "members can read note reads"
  on public.job_note_reads for select to authenticated
  using (
    exists (
      select 1 from public.job_notes n
      where n.id = job_note_reads.note_id
        and private.is_org_member(n.organization_id)
        and (
          n.visibility = 'internal'
          or private.is_office_member(n.organization_id)
        )
    )
  );

drop policy if exists "members can write note reads" on public.job_note_reads;
create policy "members can write note reads"
  on public.job_note_reads for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.job_notes n
      where n.id = job_note_reads.note_id
        and private.is_org_member(n.organization_id)
    )
  );

-- ============================================================
-- 2. Atomic scheduling + assignment
-- ============================================================
-- Assigns a technician and time window atomically:
-- - Rejects if the job changed since the caller read it (stale update).
-- - Rejects if the technician has an overlapping assignment.
-- - Verifies technician belongs to the same org and is active.
-- - Only office staff (not technicians) can assign.
-- - Advisory lock on technician serializes concurrent assignments.
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

  select organization_id, updated_at into v_org, v_current_updated_at
  from public.jobs where id = p_job_id;
  if v_org is null then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;

  if not private.is_office_member(v_org) then
    raise exception 'Not authorized: office staff only' using errcode = '42501';
  end if;

  -- Stale-update rejection: caller must have the current version.
  if v_current_updated_at != p_expected_updated_at then
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

grant execute on function public.assign_job(uuid, uuid, timestamptz, timestamptz, timestamptz)
  to authenticated;

comment on function public.assign_job(uuid, uuid, timestamptz, timestamptz, timestamptz) is
  'Atomic assign: office-only, verifies tech org/active, rejects stale updates and overlapping assignments (advisory lock serialized).';

-- ============================================================
-- 3. Warehouse receipts (job-linked proof of delivery)
-- ============================================================
create table if not exists public.warehouse_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  part_tracking_id uuid references public.part_tracking(id) on delete set null,
  received_by_user_id uuid references auth.users(id) on delete set null,
  received_at timestamptz not null default now(),
  condition text not null default 'good'
    check (condition in ('good', 'damaged', 'partial')),
  notes text,
  photo_path text,
  created_at timestamptz not null default now()
);

alter table public.warehouse_receipts enable row level security;

drop policy if exists "members can read receipts" on public.warehouse_receipts;
create policy "members can read receipts"
  on public.warehouse_receipts for select to authenticated
  using (private.is_org_member(organization_id));

drop policy if exists "members can write receipts" on public.warehouse_receipts;
create policy "members can write receipts"
  on public.warehouse_receipts for insert to authenticated
  with check (private.is_org_member(organization_id));

-- ============================================================
-- 4. Customer updates (delivery lifecycle)
-- ============================================================
create table if not exists public.customer_updates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null,
  channel text not null check (channel in ('email', 'sms')),
  recipient text not null,
  subject text,
  body text not null,
  status text not null default 'draft'
    check (status in (
      'draft', 'queued', 'sent', 'delivered', 'confirmed',
      'failed', 'bounced'
    )),
  provider text,
  provider_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  confirmed_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  escalated boolean not null default false,
  escalated_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_updates enable row level security;

drop policy if exists "office can manage customer updates" on public.customer_updates;
create policy "office can manage customer updates"
  on public.customer_updates for all to authenticated
  using (private.is_office_member(organization_id))
  with check (private.is_office_member(organization_id));

drop policy if exists "members can read customer updates" on public.customer_updates;
create policy "members can read customer updates"
  on public.customer_updates for select to authenticated
  using (private.is_org_member(organization_id));

comment on table public.customer_updates is
  'Customer-facing comms lifecycle. sent≠delivered≠confirmed. Office notifications table is internal-only and never counts as customer contact.';

-- ============================================================
-- Supabase "final notice" (email Oct 20, 2026): from Oct 30, 2026 new
-- tables in public no longer receive automatic Data API grants.
-- These explicit grants keep the four new tables reachable through
-- PostgREST / supabase-js. The row-level policies above still
-- enforce who can actually read or write rows. GRANT is
-- idempotent: safe whether this migration runs before or after
-- Oct 30, and safe to re-run.
-- ============================================================
grant select, insert, update, delete on public.job_notes to anon, authenticated, service_role;
grant select, insert, update, delete on public.job_note_reads to anon, authenticated, service_role;
grant select, insert, update, delete on public.warehouse_receipts to anon, authenticated, service_role;
grant select, insert, update, delete on public.customer_updates to anon, authenticated, service_role;
