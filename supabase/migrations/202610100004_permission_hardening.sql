-- Backend permission hardening (Codex security findings 2026-10-10).
--
-- 1. organization_members.active: ensure the column exists (web app already
--    filters on it; the DB helper did not).
-- 2. private.is_org_member: now requires active = true. Inactive members
--    lose access everywhere this helper is used (all org-scoped policies).
-- 3. private.is_office_member / private.is_org_admin: new role helpers.
-- 4. supplier_materials: office-only read/write. Technicians can no longer
--    read internal pricing (public_price_cents, cost basis, supplier URLs).
--    Business rule: internal pricing is never visible to techs or clients.
-- 5. organization_members: writes restricted to owners/admins. Members keep
--    read access; only admins can add/remove/change roles.

-- 1. Ensure the active flag exists.
alter table public.organization_members
  add column if not exists active boolean not null default true;

-- 2. is_org_member now requires an ACTIVE membership.
create or replace function private.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.active = true
  );
$$;

-- 3a. Office staff helper: owner/admin/office/dispatcher (excludes technician).
create or replace function private.is_office_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.active = true
      and m.role in ('owner', 'admin', 'office', 'dispatcher')
  );
$$;

-- 3b. Org admin helper: owner/admin only.
create or replace function private.is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.active = true
      and m.role in ('owner', 'admin')
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_office_member(uuid) to authenticated;
grant execute on function private.is_org_admin(uuid) to authenticated;

-- 4. supplier_materials: office-only. Technicians are denied entirely.
drop policy if exists "members can read supplier materials" on public.supplier_materials;
drop policy if exists "members can write supplier materials" on public.supplier_materials;

drop policy if exists "office can read supplier materials" on public.supplier_materials;
create policy "office can read supplier materials"
  on public.supplier_materials
  for select to authenticated
  using (private.is_office_member(organization_id));

drop policy if exists "office can write supplier materials" on public.supplier_materials;
create policy "office can write supplier materials"
  on public.supplier_materials
  for all to authenticated
  using (private.is_office_member(organization_id))
  with check (private.is_office_member(organization_id));

-- 5. organization_members: members read, admins write.
drop policy if exists "members can read members" on public.organization_members;
create policy "members can read members"
  on public.organization_members
  for select to authenticated
  using (private.is_org_member(organization_id));

drop policy if exists "members can write members" on public.organization_members;

drop policy if exists "admins can manage members" on public.organization_members;
create policy "admins can manage members"
  on public.organization_members
  for all to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

comment on function private.is_office_member(uuid) is
  'True for active owner/admin/office/dispatcher memberships. Technicians excluded.';
comment on function private.is_org_admin(uuid) is
  'True for active owner/admin memberships. Used for role administration.';
