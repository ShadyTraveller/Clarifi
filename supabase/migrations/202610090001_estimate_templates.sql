-- Yavamo mobile phase: estimate templates + local materials catalog.
-- Request → Template → Estimate → Job cloning architecture.
--
-- A request picks a master estimate_templates row. Its template_line_items are
-- CLONED (never moved) into quote_line_items under a fresh quote_versions row,
-- so the master template is never mutated. Clone mapping (app-side, reusing the
-- TypeScript buildEstimate engine — kept out of SQL to avoid math divergence):
--   part     → unit_cost    = coalesce(unit_price_cents, material.public_price_cents) / 100
--               markup_percent = pricing_rule.markup_percent ?? 20
--               unit_price   = round(unit_cost * (1 + markup_percent/100), 2)
--   labour   → unit_cost    = pricing_rule.amount_cents / 100
--               (tier standard 15000 / priority 18000 / emergency 22000)
--               markup_percent = 0, unit_price = unit_cost   (flat rate, never marked up)
--   shipping → unit_cost    = pricing_rule.amount_cents / 100  (2000 = $20 flat)
--               markup_percent = 0, unit_price = unit_cost
--   fee      → unit_cost    = pricing_rule.amount_cents / 100, markup_percent = 0
--   total    → unit_price * quantity   (for every kind)
--
-- pricing_rule JSONB shapes:
--   part:     {"markup_percent": 20, "pricing": "catalog"}   (margin office-adjustable 15–25)
--   labour:   {"tier": "standard", "amount_cents": 15000,
--              "tiers": {"standard": 15000, "priority": 18000, "emergency": 22000}}
--   shipping: {"amount_cents": 2000}
--   fee:      {"fee": "assessment", "amount_cents": 6900}
-- unit_price_cents is a manual override; NULL means "resolve at estimate time"
-- from the linked material (part) or pricing_rule (labour/shipping/fee).
-- NOTE: the $69 assessment fee is tracked on jobs.assessment_fee_cents /
-- quotes.assessment_credited_cents (agents migration) — it is intentionally NOT
-- seeded as a template line, to avoid double-counting.
--
-- INTERNAL-ONLY: supplier_materials.public_price_cents is the cost basis Yavamo
-- pays (public retail). It must NEVER be exposed to clients — client views read
-- only quote_line_items.unit_price / total. No client-facing policies are created
-- on these tables for that reason.

-- 2026-10-08: the live DB had a stray VIEW named public.supplier_materials
-- (not created by any migration; views hold no data and nothing references it).
-- Drop it so the real catalog table below can be created.
drop view if exists public.supplier_materials;

create table if not exists public.estimate_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service text not null check (service in ('doors', 'security-film', 'locksmith', 'skincare')),
  name text not null,
  description text,
  version int not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, service, name)
);

create table if not exists public.supplier_materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service text not null check (service in ('doors', 'security-film', 'locksmith', 'skincare')),
  name text not null,
  brand text,
  public_price_cents integer not null check (public_price_cents >= 0),
  currency text not null default 'CAD',
  retailer text,
  source_url text,
  sku text,
  unit text not null default 'each',
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.supplier_materials is
  'Local materials catalog. public_price_cents is the INTERNAL cost basis — never expose to clients; client views must only read quote_line_items.unit_price/total.';
comment on column public.supplier_materials.public_price_cents is
  'INTERNAL ONLY: what Yavamo pays (public retail). Client price = this + margin via quote_line_items.markup_percent. Never send to clients.';

create table if not exists public.template_line_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.estimate_templates(id) on delete cascade,
  kind text not null check (kind in ('part', 'labour', 'shipping', 'fee')),
  label text not null,
  material_id uuid references public.supplier_materials(id) on delete set null,
  quantity numeric(12,3) not null default 1,
  unit_price_cents integer check (unit_price_cents is null or unit_price_cents >= 0),
  pricing_rule jsonb not null default '{}'::jsonb,
  sort_order int not null default 0
);

alter table public.estimate_templates enable row level security;
alter table public.supplier_materials enable row level security;
alter table public.template_line_items enable row level security;

do $$ begin
  create policy "members can read estimate templates" on public.estimate_templates
    for select to authenticated using (private.is_org_member(organization_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members can write estimate templates" on public.estimate_templates
    for all to authenticated using (private.is_org_member(organization_id))
    with check (private.is_org_member(organization_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members can read supplier materials" on public.supplier_materials
    for select to authenticated using (private.is_org_member(organization_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members can write supplier materials" on public.supplier_materials
    for all to authenticated using (private.is_org_member(organization_id))
    with check (private.is_org_member(organization_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members can read template line items" on public.template_line_items
    for select to authenticated using (
      exists(select 1 from public.estimate_templates t
             where t.id = template_id and private.is_org_member(t.organization_id)));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members can write template line items" on public.template_line_items
    for all to authenticated using (
      exists(select 1 from public.estimate_templates t
             where t.id = template_id and private.is_org_member(t.organization_id)))
    with check (
      exists(select 1 from public.estimate_templates t
             where t.id = template_id and private.is_org_member(t.organization_id)));
exception when duplicate_object then null; end $$;

create index if not exists estimate_templates_org_service_idx
  on public.estimate_templates (organization_id, service) where is_active;
create index if not exists template_line_items_template_idx
  on public.template_line_items (template_id, sort_order);
create index if not exists supplier_materials_org_service_idx
  on public.supplier_materials (organization_id, service) where is_active;

-- Seed 4 starter templates (one per in-scope service), idempotent per org.
-- Part lines are "pick from catalog" placeholders (material_id NULL) until the
-- materials research pass fills supplier_materials.
do $$
declare
  org uuid;
  t_id uuid;
begin
  for org in select id from public.organizations loop

    -- 1. doors
    insert into public.estimate_templates (organization_id, service, name, description, version)
    values (org, 'doors', 'Door replacement — standard',
            'Standard door replacement: slab + hardware from catalog, flat-rate labour, $20 shipping.', 1)
    on conflict (organization_id, service, name) do nothing;
    select id into t_id from public.estimate_templates
      where organization_id = org and service = 'doors' and name = 'Door replacement — standard';
    delete from public.template_line_items where template_id = t_id;
    insert into public.template_line_items (template_id, kind, label, quantity, pricing_rule, sort_order) values
      (t_id, 'part', 'Door slab — pick from catalog', 1, '{"markup_percent": 20, "pricing": "catalog"}'::jsonb, 10),
      (t_id, 'part', 'Hinges + hardware set — pick from catalog', 1, '{"markup_percent": 20, "pricing": "catalog"}'::jsonb, 20),
      (t_id, 'labour', 'Labour — door install (flat rate)', 1, '{"tier": "standard", "amount_cents": 15000, "tiers": {"standard": 15000, "priority": 18000, "emergency": 22000}}'::jsonb, 30),
      (t_id, 'shipping', 'Flat shipping', 1, '{"amount_cents": 2000}'::jsonb, 40);

    -- 2. security film
    insert into public.estimate_templates (organization_id, service, name, description, version)
    values (org, 'security-film', 'Security window film — standard',
            'Security film application: film + install kit from catalog, flat-rate labour, $20 shipping.', 1)
    on conflict (organization_id, service, name) do nothing;
    select id into t_id from public.estimate_templates
      where organization_id = org and service = 'security-film' and name = 'Security window film — standard';
    delete from public.template_line_items where template_id = t_id;
    insert into public.template_line_items (template_id, kind, label, quantity, pricing_rule, sort_order) values
      (t_id, 'part', 'Security film roll — pick from catalog', 1, '{"markup_percent": 20, "pricing": "catalog"}'::jsonb, 10),
      (t_id, 'part', 'Install kit (squeegee, solution) — pick from catalog', 1, '{"markup_percent": 20, "pricing": "catalog"}'::jsonb, 20),
      (t_id, 'labour', 'Labour — film application (flat rate)', 1, '{"tier": "standard", "amount_cents": 15000, "tiers": {"standard": 15000, "priority": 18000, "emergency": 22000}}'::jsonb, 30),
      (t_id, 'shipping', 'Flat shipping', 1, '{"amount_cents": 2000}'::jsonb, 40);

    -- 3. locksmith (mechanical only: rekey / lock change — no fobs, no access control)
    insert into public.estimate_templates (organization_id, service, name, description, version)
    values (org, 'locksmith', 'Lock change / rekey — standard',
            'Rekey or lock change, mechanical only: lockset + rekey kit from catalog, flat-rate labour, $20 shipping.', 1)
    on conflict (organization_id, service, name) do nothing;
    select id into t_id from public.estimate_templates
      where organization_id = org and service = 'locksmith' and name = 'Lock change / rekey — standard';
    delete from public.template_line_items where template_id = t_id;
    insert into public.template_line_items (template_id, kind, label, quantity, pricing_rule, sort_order) values
      (t_id, 'part', 'Deadbolt + knob/lever set — pick from catalog', 1, '{"markup_percent": 20, "pricing": "catalog"}'::jsonb, 10),
      (t_id, 'part', 'Rekey kit / pin kit — pick from catalog', 1, '{"markup_percent": 20, "pricing": "catalog"}'::jsonb, 20),
      (t_id, 'labour', 'Labour — lock change (flat rate)', 1, '{"tier": "standard", "amount_cents": 15000, "tiers": {"standard": 15000, "priority": 18000, "emergency": 22000}}'::jsonb, 30),
      (t_id, 'shipping', 'Flat shipping', 1, '{"amount_cents": 2000}'::jsonb, 40);

    -- 4. skincare (red light therapy devices only)
    insert into public.estimate_templates (organization_id, service, name, description, version)
    values (org, 'skincare', 'Red light therapy — standard',
            'Private skincare, red light therapy devices only: device from catalog, flat-rate labour, $20 shipping.', 1)
    on conflict (organization_id, service, name) do nothing;
    select id into t_id from public.estimate_templates
      where organization_id = org and service = 'skincare' and name = 'Red light therapy — standard';
    delete from public.template_line_items where template_id = t_id;
    insert into public.template_line_items (template_id, kind, label, quantity, pricing_rule, sort_order) values
      (t_id, 'part', 'Red light therapy device — pick from catalog', 1, '{"markup_percent": 20, "pricing": "catalog"}'::jsonb, 10),
      (t_id, 'labour', 'Labour — treatment session (flat rate)', 1, '{"tier": "standard", "amount_cents": 15000, "tiers": {"standard": 15000, "priority": 18000, "emergency": 22000}}'::jsonb, 30),
      (t_id, 'shipping', 'Flat shipping', 1, '{"amount_cents": 2000}'::jsonb, 40);

  end loop;
end $$;
