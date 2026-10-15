-- Step 5: Payments backend.
--
-- 1. payments table: tracks payment attempts against invoices.
--    Supports Stripe (sandbox + live) via provider/payment_intent_id.
--    Status lifecycle: pending → processing → succeeded | failed | refunded.
-- 2. Invoice status: add 'sent' and 'paid' to the lifecycle.
--    Draft → sent → paid (or overdue). Only the office sends invoices.

-- ============================================================
-- 1. Payments table
-- ============================================================
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  -- Amount in cents (avoid float rounding).
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'cad',
  -- Provider-agnostic: 'stripe' for now, extensible.
  provider text not null default 'stripe',
  provider_payment_id text,  -- Stripe payment_intent id (pi_...)
  provider_status text,      -- Stripe status mirror
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'cancelled')),
  -- Sandbox vs live. Sandbox payments never touch real money.
  livemode boolean not null default false,
  failure_reason text,
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  succeeded_at timestamptz,
  -- One active payment attempt per invoice at a time (app enforces).
  -- Historical attempts preserved for audit.
  metadata jsonb not null default '{}'::jsonb
);

alter table public.payments enable row level security;

-- Office staff manage payments; technicians can read (to see payment status).
drop policy if exists "office can manage payments" on public.payments;
create policy "office can manage payments"
  on public.payments for all to authenticated
  using (private.is_office_member(organization_id))
  with check (private.is_office_member(organization_id));

drop policy if exists "members can read payments" on public.payments;
create policy "members can read payments"
  on public.payments for select to authenticated
  using (private.is_org_member(organization_id));

-- Index for invoice payment lookup
create index if not exists payments_invoice_idx
  on public.payments (invoice_id, created_at desc);

comment on table public.payments is
  'Payment attempts against invoices. livemode=false = sandbox/test. Status: pending → processing → succeeded|failed|refunded.';

-- ============================================================
-- 2. Invoice status lifecycle
-- ============================================================
-- Add 'sent' and 'paid' statuses. Invoices start as 'draft' (office-only),
-- move to 'sent' when the office sends them, 'paid' when payment succeeds.
-- Note: existing 'draft' rows unaffected.

-- The status column is text (not enum), so no migration needed for new values.
-- Documenting the lifecycle here:
--   draft → sent → paid
--   draft → voided (cancelled before sending)
--   sent → overdue (past due_at, unpaid)
comment on column public.invoices.status is
  'Lifecycle: draft (office-only) → sent → paid. Also: voided, overdue. Only the office sends invoices; clients never see drafts.';
