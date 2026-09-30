-- MVP operational tables added to the live Clarifi project.
create table if not exists public.job_measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  label text not null,
  value numeric(12,3),
  unit text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  invoice_number text not null,
  status text not null default 'draft',
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique(organization_id,invoice_number)
);

alter table public.job_measurements enable row level security;
alter table public.invoices enable row level security;

create policy "members_manage_measurements" on public.job_measurements for all to authenticated
using (private.is_org_member(organization_id)) with check (private.is_org_member(organization_id));

create policy "members_manage_invoices" on public.invoices for all to authenticated
using (private.is_org_member(organization_id)) with check (private.is_org_member(organization_id));
