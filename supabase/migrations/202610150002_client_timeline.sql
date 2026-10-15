-- Step 4: Client timeline backend.
--
-- 1. Access/COI columns on jobs: structured storage for gate codes,
--    unit numbers, COI requirements, and access notes captured at intake.
-- 2. job_timeline RPC: unified chronological feed combining notes,
--    customer updates, and job lifecycle events for the client timeline UI.
--    Respects note visibility (technicians don't see office-only notes).

-- ============================================================
-- 1. Access / COI details
-- ============================================================
alter table public.jobs
  add column if not exists gate_code text,
  add column if not exists unit_number text,
  add column if not exists coi_required boolean not null default false,
  add column if not exists coi_notes text,
  add column if not exists access_notes text;

comment on column public.jobs.gate_code is
  'Gate / entry code for technician access (captured at intake).';
comment on column public.jobs.unit_number is
  'Unit / apartment number within the building.';
comment on column public.jobs.coi_required is
  'Whether a Certificate of Insurance is required before work begins.';
comment on column public.jobs.coi_notes is
  'COI details: who to send to, coverage requirements, etc.';
comment on column public.jobs.access_notes is
  'Access instructions: parking, elevator, contact on arrival, etc.';

-- ============================================================
-- 2. Unified timeline RPC
-- ============================================================
-- Returns chronological timeline entries for a job:
--   - notes (respecting visibility: office-only hidden from technicians)
--   - customer_updates (delivery lifecycle)
--   - job lifecycle events (created, assigned, scheduled, completed)
--
-- Each entry: { id, kind, created_at, actor, title, body, metadata }
create or replace function public.job_timeline(p_job_id uuid)
returns table (
  id uuid,
  kind text,
  created_at timestamptz,
  actor_name text,
  title text,
  body text,
  metadata jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_is_office boolean;
begin
  select organization_id into v_org
  from public.jobs where id = p_job_id;
  if v_org is null then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;

  if not private.is_org_member(v_org) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  v_is_office := private.is_office_member(v_org);

  return query
  -- Notes (visibility-filtered)
  select
    n.id,
    'note'::text as kind,
    n.created_at,
    coalesce(u.raw_user_meta_data->>'name', u.email, 'Unknown') as actor_name,
    case n.visibility
      when 'office' then 'Office note'
      else 'Note'
    end as title,
    n.body,
    jsonb_build_object('visibility', n.visibility) as metadata
  from public.job_notes n
  left join auth.users u on u.id = n.author_user_id
  where n.job_id = p_job_id
    and (n.visibility = 'internal' or v_is_office)

  union all

  -- Customer updates (delivery lifecycle)
  select
    cu.id,
    'customer_update'::text as kind,
    cu.created_at,
    coalesce(creator.raw_user_meta_data->>'name', creator.email, 'Office') as actor_name,
    case cu.kind
      when 'estimate_ready' then 'Estimate sent'
      when 'scheduled' then 'Appointment scheduled'
      when 'on_the_way' then 'Technician en route'
      when 'completed' then 'Job completed'
      when 'invoice_sent' then 'Invoice sent'
      when 'review_request' then 'Review requested'
      else initcap(replace(cu.kind, '_', ' '))
    end as title,
    cu.body,
    jsonb_build_object(
      'status', cu.status,
      'channel', cu.channel,
      'kind', cu.kind
    ) as metadata
  from public.customer_updates cu
  left join auth.users creator on creator.id = cu.created_by_user_id
  where cu.job_id = p_job_id

  union all

  -- Job lifecycle events
  select
    j.id,
    'lifecycle'::text as kind,
    j.created_at,
    'System'::text as actor_name,
    'Request created'::text as title,
    j.request as body,
    jsonb_build_object('status', j.status::text) as metadata
  from public.jobs j
  where j.id = p_job_id

  union all

  select
    j.id,
    'lifecycle'::text as kind,
    j.updated_at,
    'System'::text as actor_name,
    'Technician assigned'::text as title,
    coalesce(t.name, 'Unassigned') as body,
    jsonb_build_object(
      'technician_id', j.technician_id,
      'scheduled_start', j.scheduled_start,
      'scheduled_end', j.scheduled_end
    ) as metadata
  from public.jobs j
  left join public.technicians t on t.id = j.technician_id
  where j.id = p_job_id
    and j.technician_id is not null

  order by created_at desc;
end;
$$;

grant execute on function public.job_timeline(uuid) to authenticated;

comment on function public.job_timeline(uuid) is
  'Unified client timeline: notes (visibility-filtered), customer updates, lifecycle events. Chronological, newest first.';
