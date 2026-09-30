-- Clarifi internal-only security hardening
-- Customers do not authenticate and no anonymous customer workflow exists.

drop function if exists public.approve_public_quote(text,text,text,text);

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;
revoke usage on all sequences in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke usage on sequences from anon;

revoke execute on function public.create_organization(text) from public, anon, authenticated;

create schema if not exists private;

create or replace function private.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.organization_members m
    where m.organization_id=target_org
      and m.user_id=(select auth.uid())
  );
$$;

revoke all on function private.is_org_member(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;

-- Existing organization-scoped RLS policies in the live project use private.is_org_member().
