import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

// 2026-10-09: the deterministic engine moved to @yavamo/core
// (packages/core/src). Load the canonical modules directly; './types' imports
// are import-type-only and erased by stripTypeScriptTypes.
const pricingUrl = 'data:text/javascript;base64,' + Buffer.from(
  stripTypeScriptTypes(fs.readFileSync(new URL('../packages/core/src/pricing.ts', import.meta.url), 'utf8'))
).toString('base64');

const domainCode = stripTypeScriptTypes(
  fs.readFileSync(new URL('../app/lib/domain.ts', import.meta.url), 'utf8')
).replaceAll("'@yavamo/core'", JSON.stringify(pricingUrl));
const domainUrl = 'data:text/javascript;base64,' + Buffer.from(domainCode).toString('base64');

const templatesCode = stripTypeScriptTypes(
  fs.readFileSync(new URL('../app/lib/service-templates.ts', import.meta.url), 'utf8')
).replaceAll("'./domain'", JSON.stringify(domainUrl))
  .replaceAll("'@yavamo/core'", JSON.stringify(pricingUrl));
const templatesUrl = 'data:text/javascript;base64,' + Buffer.from(templatesCode).toString('base64');

const estimateCode = stripTypeScriptTypes(
  fs.readFileSync(new URL('../packages/core/src/estimate.ts', import.meta.url), 'utf8')
).replaceAll("'./pricing'", JSON.stringify(pricingUrl));
const estimateUrl = 'data:text/javascript;base64,' + Buffer.from(estimateCode).toString('base64');

const { buildEstimate, buildAgentEstimateInput } = await import(estimateUrl);
const { ASSESSMENT_FEE_CENTS, PART_MARGIN_DEFAULT_PCT, LABOR_FLAT, SHIPPING_FLAT } =
  await import(pricingUrl);
const { SERVICE_TEMPLATES, getTemplate } = await import(templatesUrl);

const locksmith = getTemplate('Locksmith');

function priced(template, tierKey, parts, extra = {}) {
  const { input } = buildAgentEstimateInput({ template, parts, tierKey, ...extra });
  return buildEstimate(input);
}

test('constants match the confirmed fee/schedule', () => {
  assert.equal(ASSESSMENT_FEE_CENTS, 6900); // $69
  assert.equal(PART_MARGIN_DEFAULT_PCT, 20);
  assert.equal(LABOR_FLAT, 180);
  assert.equal(SHIPPING_FLAT, 20);
});

test('priority labour totals exactly $180 (flat, 0% margin)', () => {
  const r = priced(locksmith, 'priority', []);
  assert.equal(r.labor.length, 1);
  assert.equal(r.labor[0].unitPrice, 180);
  assert.equal(r.labor[0].lineTotal, 180);
});

test('emergency labour totals exactly $220 (flat, 0% margin)', () => {
  const r = priced(locksmith, 'emergency', []);
  assert.equal(r.labor[0].unitPrice, 220);
  assert.equal(r.labor[0].lineTotal, 220);
});

test('shipping line totals exactly $20 with 0% markup', () => {
  const r = priced(locksmith, 'priority', []);
  const ship = r.materials.find(m => m.id === 'shipping');
  assert.ok(ship);
  assert.equal(ship.unitPrice, 20);
  assert.equal(ship.lineTotal, 20);
  assert.equal(ship.markupPct, 0);
});

test('part with supplierCost 100 at default 20% margin prices at 120', () => {
  const r = priced(locksmith, 'priority', [
    { name: 'Deadbolt', quantity: 1, unit: 'each', supplierCost: 100 },
  ]);
  const part = r.materials.find(m => m.id === 'agent-part-1');
  assert.ok(part);
  assert.equal(part.unitPrice, 120);
  assert.equal(part.lineTotal, 120);
  assert.equal(part.markupPct, 20);
});

test('part defaults: quantity 1, unit "each"', () => {
  const r = priced(locksmith, 'priority', [{ name: 'Deadbolt', supplierCost: 50 }]);
  const part = r.materials.find(m => m.id === 'agent-part-1');
  assert.equal(part.quantity, 1);
  assert.equal(part.unit, 'each');
});

test('marginPct override is honored', () => {
  const r = priced(locksmith, 'priority', [{ name: 'Deadbolt', supplierCost: 100 }], { marginPct: 15 });
  const part = r.materials.find(m => m.id === 'agent-part-1');
  assert.equal(part.unitPrice, 115);
});

test('aftermarket part is renamed and flagged for office decision', () => {
  const { input, flags } = buildAgentEstimateInput({
    template: locksmith,
    tierKey: 'priority',
    parts: [{ name: 'Deadbolt', supplierCost: 50, aftermarket: true }],
  });
  assert.ok(input.materials[0].name.includes('(aftermarket — needs office decision)'));
  assert.ok(flags.some(f => f.includes('Aftermarket part') && f.includes('Deadbolt')));
  assert.ok(flags.some(f => /office decision/.test(f)));
});

test('unpriced part is flagged for office decision', () => {
  const { input, flags } = buildAgentEstimateInput({
    template: locksmith,
    tierKey: 'priority',
    parts: [{ name: 'Gripset', supplierCost: null }],
  });
  const r = buildEstimate(input);
  const part = r.materials.find(m => m.id === 'agent-part-1');
  assert.equal(part.unitPrice, null);
  assert.ok(flags.some(f => f.includes('Unpriced part') && f.includes('Gripset')));
});

test('no flags for a clean priced non-aftermarket part', () => {
  const { flags } = buildAgentEstimateInput({
    template: locksmith,
    tierKey: 'priority',
    parts: [{ name: 'Deadbolt', supplierCost: 100 }],
  });
  assert.deepEqual(flags, []);
});

test('jobCount 2 keeps a single labour line (two distinct jobs: assessment x2, labour x1)', () => {
  const { input } = buildAgentEstimateInput({
    template: locksmith,
    tierKey: 'priority',
    parts: [],
    jobCount: 2,
  });
  const r = buildEstimate(input);
  assert.equal(r.labor.length, 1);
  assert.equal(r.labor[0].lineTotal, 180);
  // assessment-fee math note: 2 jobs -> 2 x $69 = $138 recorded on the job, not the estimate
  assert.equal(ASSESSMENT_FEE_CENTS * 2, 13800);
});

test('default 20% margin survives the materialMarkupMax clamp on all 5 templates', () => {
  assert.equal(SERVICE_TEMPLATES.length, 5);
  for (const template of SERVICE_TEMPLATES) {
    const r = priced(template, 'priority', [{ name: 'Test part', supplierCost: 100 }]);
    const part = r.materials.find(m => m.id === 'agent-part-1');
    assert.equal(part.markupPct, 20, `${template.key}: markup was clamped`);
    assert.ok(!r.warnings.some(w => w.includes('clamped')), `${template.key}: clamp warning`);
  }
});
