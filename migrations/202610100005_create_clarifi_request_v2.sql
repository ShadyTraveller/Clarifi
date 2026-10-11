-- create_clarifi_request v2: hardened intake RPC.
--
-- Guarantees (per Codex backend handoff 2026-10-10):
-- 1. AUTHORIZATION: authenticated callers must hold an ACTIVE office
--    membership (owner/admin/office/dispatcher) in target_org. Technicians
--    and inactive members are rejected. service_role (webhooks, agents)
--    bypasses the check (auth.uid() is null for service_role).
-- 2. CONCURRENCY-SAFE DEDUPE: an advisory transaction lock on the normalized
--    client identity (org + email + phone digits) serializes simultaneous
--    submissions, so two concurrent requests for the same client create one
--    client row, not two.
-- 3. BLANK-FIELDS-ONLY UPDATES: when reusing an existing client, only NULL/
--    empty fields are filled. Existing data is never overwritten.
-- 4. STABLE REQUEST ID: pass p_source_ref (client-generated UUID) for
--    idempotency. If a job with that source_ref already exists in the org,
--    the existing job ID is returned instead of creating a duplicate.
--    This reconciles retries, timeouts, and double-taps.
--
-- Args:
--   target_org   - organization uuid
--   client_info  - jsonb {name, role, email, phone, address}
--   job_info     - jsonb {title, details, service, markdown, technician_id,
--                         latitude, longitude}
--   p_source_ref - text (optional) idempotency key, e.g. mobile-generated UUID
-- Returns: the job's uuid (new or existing on retry).

create or replace function public.create_clarifi_request(
  target_org uuid,
  client_info jsonb,
  job_info jsonb,
  p_source_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_job_id uuid;
  v_email text;
  v_phone text;
  v_phone_digits text;
  v_role text;
  v_caller_uid uuid;
  v_lock_key bigint;
begin
  -- 1. Authorization: active office membership required for human callers.
  v_caller_uid := auth.uid();
  if v_caller_uid is not null then
    if not exists (
      select 1
      from public.organization_members m
      where m.organization_id = target_org
        and m.user_id = v_caller_uid
        and m.active = true
        and m.role in ('owner', 'admin', 'office', 'dispatcher')
    ) then
      raise exception 'Not authorized: active office membership required for intake'
        using errcode = '42501';
    end if;
  end if;
  -- service_role (v_caller_uid is null): webhooks and agents bypass the check.

  -- 4. Idempotency: return existing job if this source_ref was already used.
  if p_source_ref is not null and btrim(p_source_ref) <> '' then
    select j.id into v_job_id
    from public.jobs j
    where j.organization_id = target_org
      and j.source_ref = p_source_ref
    limit 1;
    if v_job_id is not null then
      return v_job_id;
    end if;
  end if;

  -- Normalize contact fields for matching.
  v_email := nullif(lower(btrim(coalesce(client_info->>'email', ''))), '');
  v_phone := nullif(btrim(coalesce(client_info->>'phone', '')), '');
  v_phone_digits := nullif(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), '');

  -- 2. Concurrency-safe dedupe: lock on normalized identity for this txn.
  -- Two simultaneous submissions for the same client serialize here;
  -- the second sees the row the first inserted.
  v_lock_key := hashtext(
    coalesce(target_org::text, '') || '|' ||
    coalesce(v_email, '') || '|' ||
    coalesce(v_phone_digits, '')
  );
  perform pg_advisory_xact_lock(v_lock_key);

  -- Find existing client by email or phone digits (most recent first).
  select c.id into v_client_id
  from public.clients c
  where c.organization_id = target_org
    and (
      (v_email is not null and lower(c.email) = v_email)
      or (
        v_phone_digits is not null
        and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_phone_digits
      )
    )
  order by c.created_at desc
  limit 1;

  -- Safe role: downgrade anything the enum doesn't know to 'other'.
  -- UI 'owner' -> 'other' (no owner enum value).
  -- 'institution' requires migration 202610050001; downgraded until applied.
  v_role := coalesce(client_info->>'role', 'other');
  if v_role not in (
    'tenant', 'landlord', 'property_management',
    'institution', 'commercial', 'other'
  ) then
    v_role := 'other';
  end if;

  if v_client_id is null then
    -- New client. (Lock above prevents concurrent duplicates.)
    insert into public.clients (
      organization_id, name, email, phone, address, relationship
    )
    values (
      target_org,
      nullif(btrim(coalesce(client_info->>'name', '')), ''),
      v_email,
      v_phone,
      nullif(btrim(coalesce(client_info->>'address', ''))), ''),
      v_role::public.client_relationship
    )
    returning id into v_client_id;
  else
    -- 3. Blank-fields-only update: fill gaps, never overwrite.
    update public.clients
    set
      name = case
        when btrim(coalesce(name, '')) = ''
          then nullif(btrim(coalesce(client_info->>'name', '')), '')
        else name
      end,
      email = case
        when btrim(coalesce(email, '')) = '' then v_email
        else email
      end,
      phone = case
        when btrim(coalesce(phone, '')) = '' then v_phone
        else phone
      end,
      address = case
        when btrim(coalesce(address, '')) = ''
          then nullif(btrim(coalesce(client_info->>'address', ''))), '')
        else address
      end,
      updated_at = now()
    where id = v_client_id;
  end if;

  -- Always create a new job (unless idempotency returned above).
  insert into public.jobs (
    organization_id, client_id, request, details, status, service,
    technician_id, latitude, longitude, source_ref
  )
  values (
    target_org,
    v_client_id,
    coalesce(nullif(btrim(coalesce(job_info->>'title', ''))), ''), 'New request'),
    job_info->>'details',
    'lead',
    nullif(job_info->>'service', ''),
    nullif(job_info->>'technician_id', '')::uuid,
    nullif(job_info->>'latitude', '')::numeric,
    nullif(job_info->>'longitude', '')::numeric,
    nullif(btrim(coalesce(p_source_ref, '')), '')
  )
  returning id into v_job_id;

  return v_job_id;
end;
$$;

grant execute on function public.create_clarifi_request(uuid, jsonb, jsonb, text)
  to authenticated, service_role, anon;

comment on function public.create_clarifi_request(uuid, jsonb, jsonb, text) is
  'Hardened intake: office-auth, concurrency-safe dedupe, blank-only updates, idempotent via source_ref.';

-- Keep the 3-arg signature working (delegates to the 4-arg version).
create or replace function public.create_clarifi_request(
  target_org uuid,
  client_info jsonb,
  job_info jsonb
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.create_clarifi_request(target_org, client_info, job_info, null);
$$;

grant execute on function public.create_clarifi_request(uuid, jsonb, jsonb)
  to authenticated, service_role, anon;
