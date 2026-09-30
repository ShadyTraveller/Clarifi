create extension if not exists pgcrypto;

do $$ begin create type client_relationship as enum ('tenant','landlord','property_management','commercial','other'); exception when duplicate_object then null; end $$;
do $$ begin create type project_status as enum ('lead','active','estimate','completed'); exception when duplicate_object then null; end $$;
do $$ begin create type member_role as enum ('owner','admin','dispatcher','technician','office'); exception when duplicate_object then null; end $$;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'technician',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  address text,
  relationship client_relationship not null default 'other',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  request text not null,
  details text,
  status project_status not null default 'lead',
  assigned_to uuid references auth.users(id) on delete set null,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists job_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create table if not exists scope_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  trade text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists template_variables (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references scope_templates(id) on delete cascade,
  key text not null,
  label text not null,
  input_type text not null default 'text',
  unit text,
  required boolean not null default false,
  sort_order int not null default 0
);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  quote_number text not null,
  public_token text not null unique default encode(gen_random_bytes(18), 'base64url'),
  status text not null default 'draft',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, quote_number)
);

create table if not exists quote_versions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  version_number int not null,
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (quote_id, version_number)
);

create table if not exists quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_version_id uuid not null references quote_versions(id) on delete cascade,
  item_name text not null,
  description text,
  quantity numeric(12,3) not null default 1,
  unit text,
  unit_cost numeric(12,2) not null default 0,
  markup_percent numeric(7,2) not null default 20,
  unit_price numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  sort_order int not null default 0
);

create table if not exists quote_approvals (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  quote_version_id uuid not null references quote_versions(id) on delete cascade,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  signature_data text,
  approved_at timestamptz not null default now(),
  ip_address inet,
  user_agent text
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  sender_client boolean not null default false,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists job_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table clients enable row level security;
alter table jobs enable row level security;
alter table job_files enable row level security;
alter table scope_templates enable row level security;
alter table template_variables enable row level security;
alter table quotes enable row level security;
alter table quote_versions enable row level security;
alter table quote_line_items enable row level security;
alter table quote_approvals enable row level security;
alter table messages enable row level security;
alter table job_events enable row level security;

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security invoker as $$
  select exists(select 1 from public.organization_members m where m.organization_id = target_org and m.user_id = auth.uid());
$$;

create policy "members can read organizations" on organizations for select to authenticated using (is_org_member(id));
create policy "members can read clients" on clients for select to authenticated using (is_org_member(organization_id));
create policy "members can write clients" on clients for all to authenticated using (is_org_member(organization_id)) with check (is_org_member(organization_id));
create policy "members can read jobs" on jobs for select to authenticated using (is_org_member(organization_id));
create policy "members can write jobs" on jobs for all to authenticated using (is_org_member(organization_id)) with check (is_org_member(organization_id));
create policy "members can read files" on job_files for select to authenticated using (is_org_member(organization_id));
create policy "members can write files" on job_files for all to authenticated using (is_org_member(organization_id)) with check (is_org_member(organization_id));
create policy "members can read templates" on scope_templates for select to authenticated using (is_org_member(organization_id));
create policy "members can write templates" on scope_templates for all to authenticated using (is_org_member(organization_id)) with check (is_org_member(organization_id));
create policy "members can read variables" on template_variables for select to authenticated using (exists(select 1 from scope_templates t where t.id = template_id and is_org_member(t.organization_id)));
create policy "members can read quotes" on quotes for select to authenticated using (is_org_member(organization_id));
create policy "members can write quotes" on quotes for all to authenticated using (is_org_member(organization_id)) with check (is_org_member(organization_id));
create policy "members can read quote versions" on quote_versions for select to authenticated using (exists(select 1 from quotes q where q.id = quote_id and is_org_member(q.organization_id)));
create policy "members can write quote versions" on quote_versions for all to authenticated using (exists(select 1 from quotes q where q.id = quote_id and is_org_member(q.organization_id))) with check (exists(select 1 from quotes q where q.id = quote_id and is_org_member(q.organization_id)));
create policy "members can read quote lines" on quote_line_items for select to authenticated using (exists(select 1 from quote_versions v join quotes q on q.id = v.quote_id where v.id = quote_version_id and is_org_member(q.organization_id)));
create policy "members can write quote lines" on quote_line_items for all to authenticated using (exists(select 1 from quote_versions v join quotes q on q.id = v.quote_id where v.id = quote_version_id and is_org_member(q.organization_id))) with check (exists(select 1 from quote_versions v join quotes q on q.id = v.quote_id where v.id = quote_version_id and is_org_member(q.organization_id)));
create policy "members can read approvals" on quote_approvals for select to authenticated using (exists(select 1 from quotes q where q.id = quote_id and is_org_member(q.organization_id)));
create policy "members can read messages" on messages for select to authenticated using (is_org_member(organization_id));
create policy "members can write messages" on messages for all to authenticated using (is_org_member(organization_id)) with check (is_org_member(organization_id));
create policy "members can read events" on job_events for select to authenticated using (is_org_member(organization_id));
