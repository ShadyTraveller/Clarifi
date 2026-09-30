# Clarifi MVP architecture

## Clients
- **Back-office web:** current Next.js dashboard, responsive and optimized for dispatch/office workflows.
- **Technician mobile:** React Native + Expo client. It should consume the same authenticated service contract rather than duplicate pricing logic.
- **Customer estimate:** narrow secure-link experience; no customer account required.

Expo supports Android, iOS and web from a shared TypeScript/React Native codebase. The native technician app should be introduced as a separate client package when store builds begin; the existing Next.js office dashboard does not need to be rewritten first.

## API / service boundary
- Supabase Auth identifies staff.
- Shipped web/mobile clients use the Supabase **publishable** key only.
- PostgreSQL RLS is the authorization boundary for ordinary authenticated operations.
- Supabase Edge Functions / controlled server routes handle public secure links, provider integrations, webhooks, rate limiting and operations requiring a Supabase secret key.
- Secret/service-role credentials must never be shipped in browser or Expo bundles.

## Core field-quote contract
1. `start_field_quote(job, template)` clones master `template_pricing_items` into job-owned `field_quote_items`.
2. Technician edits the job-owned instance only.
3. `field_quote_catalog(job, search)` searches the local material catalog.
4. `add_field_quote_material` and `update_field_quote_quantity` mutate the active job quote.
5. `calculate_field_quote` applies pricing profile, markup, emergency multiplier and tax.
6. `finalize_field_quote` captures typed-name approval, snapshots an immutable quote/version, activates the job subject to service-call rules, and creates a draft invoice outline.

## Material catalog
Canonical storage remains `supplier_products`. The RLS-aware `supplier_materials` view is the stable MVP catalog contract for client/service code. Entries may be internal allowances, manually verified Home Depot Canada/Amazon.ca records, or future authorized supplier adapters. Source and verification timestamp must remain visible internally.

## UX rule
Progressive disclosure. Technician primary path is **Today / Job / Quote / Complete**. Office primary path is **Intake / Scope / Price / Send / Approve / Dispatch**. Supplier pricing, payments and customer links stay contextual rather than permanent top-level navigation.
