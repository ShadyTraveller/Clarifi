-- Technician profiles and estimate-readiness workflow.
create table if not exists public.technicians (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null,
 email text,
 phone text,
 specialties text[],
 active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.technicians enable row level security;
alter table public.jobs add column if not exists technician_id uuid references public.technicians(id) on delete set null;

create table if not exists public.job_requirements (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 job_id uuid not null references public.jobs(id) on delete cascade,
 category text not null,
 label text not null,
 required boolean not null default true,
 completed boolean not null default false,
 notes text,
 created_at timestamptz not null default now()
);
alter table public.job_requirements enable row level security;

-- Live project also has private.staff_role/private.can_manage helpers and authenticated-only
-- RLS policies for these tables plus private job-files storage policies.
