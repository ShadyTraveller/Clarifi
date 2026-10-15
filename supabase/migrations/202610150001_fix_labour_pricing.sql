-- Fix labour pricing: standard tier was seeded at 15000 cents ($150), rule is 18000 cents ($180).
-- Emergency tier (22000 = $220) was already correct.
-- Idempotent: only updates rows still carrying the old 15000 values; safe to run twice.

update public.template_line_items
set pricing_rule = jsonb_set(
  jsonb_set(
    pricing_rule,
    '{amount_cents}',
    '18000'::jsonb
  ),
  '{tiers,standard}',
  '18000'::jsonb
)
where kind = 'labour'
  and (pricing_rule->>'amount_cents') = '15000';
