-- Remove legacy public customer quote-link data and support office-only approvals.
alter table public.quotes alter column public_token drop not null;
alter table public.quotes alter column public_token drop default;
update public.quotes set public_token=null;
alter table public.quotes add column if not exists approved_at timestamptz;
alter table public.quotes add column if not exists approved_by uuid references auth.users(id) on delete set null;
alter table public.quotes add column if not exists internal_notes text;
alter table public.invoices add column if not exists notes text;
alter table public.invoices add column if not exists issued_at timestamptz;
grant select,insert,update,delete on public.job_measurements to authenticated;
grant select,insert,update,delete on public.invoices to authenticated;
