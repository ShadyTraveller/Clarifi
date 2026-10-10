-- create_clarifi_request: shared intake RPC used by the Google Form webhook
-- and the web app's native IntakeWizard.
--
-- Client dedupe: searches for an existing client by email or phone (digits
-- only). Reuses the existing client (filling in any blank fields with new
-- info) instead of creating a duplicate. Always creates a NEW job (request),
-- even for existing clients.
--
-- Args:
--   target_org  - organization uuid
--   client_info - jsonb {name, role, email, phone, address}
--   job_info    - jsonb {title, details, service, markdown, technician_id,
--                        latitude, longitude}
-- Returns: the new job's uuid.

create or replace function public.create_clarifi_request(
  target_org uuid,
  client_info jsonb,
  job_info jsonb
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
begin
  -- Normalize contact fields for matching.
  v_email := nullif(lower(trim(coalesce(client_info->>'email', ''))), '');
  v_phone := nullif(trim(coalesce(client_info->>'phone', '')), '');
  v_phone_digits := nullif(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), '');

  -- Find existing client by email or phone digits (most recent first).
  select c.id into v_client_id
  from public.clients c
  where c.organization_id = target_org
    and (
      (v_email is not null and lower(c.email) = v_email)
      or (v_phone_digits is not null and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_phone_digits)
    )
  order by c.created_at desc
  limit 1;

  -- Safe role: downgrade anything the enum doesn't know to 'other'.
  v_role := coalesce(client_info->>'role', 'other');
  if v_role not in ('tenant', 'landlord', 'property_management', 'commercial', 'other') then
    v_role := 'other';
  end if;

  if v_client_id is null then
    -- New client.
    insert into public.clients (organization_id, name, email, phone, address, relationship)
    values (
      target_org,
      nullif(trim(coalesce(client_info->>'name', '')), ''),
      v_email,
      v_phone,
      nullif(trim(coalesce(client_info->>'address', '')), ''),
      v_role::public.client_relationship
    )
    returning id into v_client_id;
  else
    -- Existing client: fill in blanks with new info, keep what's there.
    update public.clients
    set
      name = coalesce(nullif(trim(coalesce(client_info->>'name', '')), ''), name),
      email = coalesce(v_email, email),
      phone = coalesce(v_phone, phone),
      address = coalesce(nullif(trim(coalesce(client_info->>'address', '')), ''), address),
      updated_at = now()
    where id = v_client_id;
  end if;

  -- Always create a new job (request), even for existing clients.
  insert into public.jobs (
    organization_id, client_id, request, details, status, service,
    technician_id, latitude, longitude
  )
  values (
    target_org,
    v_client_id,
    coalesce(nullif(trim(coalesce(job_info->>'title', '')), ''), 'New request'),
    job_info->>'details',
    'lead',
    nullif(job_info->>'service', ''),
    nullif(job_info->>'technician_id', '')::uuid,
    nullif(job_info->>'latitude', '')::numeric,
    nullif(job_info->>'longitude', '')::numeric
  )
  returning id into v_job_id;

  return v_job_id;
end;
$$;

-- Allow the webhook (service role) and app users to call it.
-- The webhook uses the service key; the wizard uses the authenticated user.
grant execute on function public.create_clarifi_request(uuid, jsonb, jsonb) to authenticated, service_role, anon;

comment on function public.create_clarifi_request(uuid, jsonb, jsonb) is
  'Shared intake: find-or-create client by email/phone (no duplicates), always create a new job.';
