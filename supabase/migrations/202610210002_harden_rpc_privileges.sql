-- 202610210002_harden_rpc_privileges.sql
-- P0 fix (audit 2026-10-21): close the anonymous intake authorization gap.
--
-- What was wrong:
-- 1. create_clarifi_request was still executable by PUBLIC. The v2 migration
--    revoked EXECUTE from anon only, but Postgres grants EXECUTE to PUBLIC by
--    default and anon inherits it (live ACL showed =X/postgres;
--    has_function_privilege('anon', ..., 'EXECUTE') was true).
-- 2. Inside the function, the office-membership check ran only when
--    auth.uid() was not null. Anonymous callers have a null uid, so they
--    skipped authorization entirely and could create clients/jobs.
--
-- What this migration does:
-- 1. Replaces the 4-arg function with the SAME body (diff-verified against
--    the v2 migration) except for a hardened authorization gate:
--    service_role trusted, authenticated callers keep the
--    active-office-membership check, and any other API caller (including
--    anon) is rejected explicitly.
-- 2. Re-asserts the 3-arg wrapper unchanged (delegates to the 4-arg one).
-- 3. Revokes EXECUTE from PUBLIC and anon on BOTH overloads; grants it to
--    authenticated and service_role only (office web/mobile UI + backend
--    webhooks are the only legitimate callers).
-- 4. Same grant hygiene for assign_job, job_timeline, triage_request:
--    their bodies already enforce authorization, but they were also
--    executable by PUBLIC/anon. Authenticated/service_role access is kept.
--
-- Idempotent: re-running is safe. No data is changed. The destructive
-- dedupe block from the v2 migration is intentionally NOT repeated.

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
  v_source_ref text;
begin
  -- 1. Authorization (hardened 2026-10-21). Previously this check ran only
  -- when auth.uid() was not null, so anonymous callers (null uid) skipped
  -- authorization entirely; EXECUTE was also still inherited from PUBLIC.
  --   service_role (backend webhooks/agents): trusted, no membership check.
  --   Authenticated humans: must hold an ACTIVE office membership (below).
  --   Any other API caller with no user id (e.g. anon): rejected outright.
  -- auth.role() is null only for direct database sessions (SQL editor,
  -- migrations), which are already fully trusted and pass through.
  v_caller_uid := auth.uid();
  if coalesce(auth.role(), '') = 'service_role' then
    null; -- trusted backend caller
  elsif v_caller_uid is not null then
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
  elsif auth.role() is not null then
    raise exception 'Not authorized: authentication required for intake'
      using errcode = '42501';
  end if;

  -- Normalize idempotency key.
  v_source_ref := nullif(btrim(coalesce(p_source_ref, '')), '');

  -- 4b. Idempotency: return existing job if this source_ref was already used.
  if v_source_ref is not null then
    select j.id into v_job_id
    from public.jobs j
    where j.organization_id = target_org
      and j.source_ref = v_source_ref
    limit 1;
    if v_job_id is not null then
      return v_job_id;
    end if;
  end if;

  -- Normalize contact fields for matching.
  v_email := nullif(lower(btrim(coalesce(client_info->>'email', ''))), '');
  v_phone := nullif(btrim(coalesce(client_info->>'phone', '')), '');
  v_phone_digits := nullif(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), '');

  -- 2. Concurrency-safe dedupe: lock on EACH identity field separately.
  -- Two submissions sharing email OR phone serialize here; the second
  -- sees the client row the first inserted.
  if v_email is not null then
    perform pg_advisory_xact_lock(hashtext('email|' || target_org::text || '|' || v_email));
  end if;
  if v_phone_digits is not null then
    perform pg_advisory_xact_lock(hashtext('phone|' || target_org::text || '|' || v_phone_digits));
  end if;

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
  v_role := coalesce(client_info->>'role', 'other');
  if v_role not in (
    'tenant', 'landlord', 'property_management',
    'institution', 'commercial', 'other'
  ) then
    v_role := 'other';
  end if;

  if v_client_id is null then
    -- New client. (Locks above prevent concurrent duplicates.)
    insert into public.clients (
      organization_id, name, email, phone, address, relationship
    )
    values (
      target_org,
      nullif(btrim(coalesce(client_info->>'name', '')), ''),
      v_email,
      v_phone,
      nullif(btrim(coalesce(client_info->>'address', '')), ''),
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
          then nullif(btrim(coalesce(client_info->>'address', '')), '')
        else address
      end,
      updated_at = now()
    where id = v_client_id;
  end if;

  -- Create the job. ON CONFLICT handles the race where two concurrent
  -- transactions both passed the idempotency check above.
  insert into public.jobs (
    organization_id, client_id, request, details, status, service,
    technician_id, latitude, longitude, source_ref
  )
  values (
    target_org,
    v_client_id,
    coalesce(nullif(btrim(coalesce(job_info->>'title', '')), ''), 'New request'),
    job_info->>'details',
    'lead',
    nullif(job_info->>'service', ''),
    nullif(job_info->>'technician_id', '')::uuid,
    nullif(job_info->>'latitude', '')::numeric,
    nullif(job_info->>'longitude', '')::numeric,
    v_source_ref
  )
  on conflict (organization_id, source_ref) where source_ref is not null
  do nothing
  returning id into v_job_id;

  -- If the insert was suppressed by the conflict, fetch the existing job.
  if v_job_id is null and v_source_ref is not null then
    select j.id into v_job_id
    from public.jobs j
    where j.organization_id = target_org
      and j.source_ref = v_source_ref
    limit 1;
  end if;

  return v_job_id;
end;
$$;

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

-- Least-privilege EXECUTE: no PUBLIC, no anon.
revoke execute on function public.create_clarifi_request(uuid, jsonb, jsonb, text) from public, anon;
revoke execute on function public.create_clarifi_request(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_clarifi_request(uuid, jsonb, jsonb, text) to authenticated, service_role;
grant execute on function public.create_clarifi_request(uuid, jsonb, jsonb) to authenticated, service_role;

revoke execute on function public.assign_job(uuid, uuid, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.assign_job(uuid, uuid, timestamptz, timestamptz, timestamptz) to authenticated, service_role;

revoke execute on function public.job_timeline(uuid) from public, anon;
grant execute on function public.job_timeline(uuid) to authenticated, service_role;

revoke execute on function public.triage_request(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.triage_request(uuid, text, text, timestamptz) to authenticated, service_role;

comment on function public.create_clarifi_request(uuid, jsonb, jsonb, text) is
  'Hardened intake: anonymous callers rejected in-body and at grant level (PUBLIC/anon revoked 2026-10-21); office-auth, dedupe, blank-only updates, idempotent via source_ref.';
