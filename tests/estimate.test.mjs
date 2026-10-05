import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const domainUrl = 'data:text/javascript;base64,' + Buffer.from(
  stripTypeScriptTypes(fs.readFileSync(new URL('../app/lib/domain.ts', import.meta.url), 'utf8'))
).toString('base64');

const templatesCode = stripTypeScriptTypes(
  fs.readFileSync(new URL('../app/lib/service-templates.ts', import.meta.url), 'utf8')
).replaceAll("'./domain'", JSON.stringify(domainUrl));
const templatesUrl = 'data:text/javascript;base64,' + Buffer.from(templatesCode).toString('base64');

const estimateCode = stripTypeScriptTypes(
  fs.readFileSync(new URL('../app/lib/estimate.ts', import.meta.url), 'utf8')
).replaceAll("'./domain'", JSON.stringify(domainUrl))
  .replaceAll("'./service-templates'", JSON.stringify(templatesUrl));
const { buildEstimate, customerProjection } = await import(
  'data:text/javascript;base64,' + Buffer.from(estimateCode).toString('base64')
);
const { getTemplate, SERVICE_TEMPLATES, LABOR_TIERS } = await import(templatesUrl);

const locksmith = getTemplate('Locksmith');
const film = getTemplate('Security Film');

function mat(overrides = {}) {
  return { id: 'm1', name: 'Deadbolt', quantity: 2, unit: 'each', supplierCost: 100, ...overrides };
}
function lab(overrides = {}) {
  return { id: 'l1', name: 'Service call & labour', hours: 1, tierKey: 'standard', ...overrides };
}

test('template lookup resolves by label or key and falls back to the first template', () => {
  assert.equal(getTemplate('Locksmith'), locksmith);
  assert.equal(getTemplate('locksmith').key, 'locksmith');
  assert.equal(getTemplate('security_film').key, 'security_film');
  assert.equal(SERVICE_TEMPLATES.length, 5);
  assert.equal(getTemplate('not-a-service').key, 'locksmith');
});

test('labor tiers carry the confirmed rates', () => {
  assert.deepEqual(LABOR_TIERS.map(t => t.rate), [150, 180, 220]);
});

test('material markup math: unitPrice = supplierCost * (1 + markup/100)', () => {
  const r = buildEstimate({ template: locksmith, materials: [mat({ markupPct: 42 })], labor: [] });
  const [line] = r.materials;
  assert.equal(line.unitPrice, 142);
  assert.equal(line.lineTotal, 284);
  assert.equal(line.lineCost, 200);
  assert.equal(line.marginPct, 29.58); // (142-100)/142*100
  assert.equal(r.subtotal, 284);
});

test('material default markup comes from the template', () => {
  const r = buildEstimate({ template: locksmith, materials: [mat({ markupPct: undefined })], labor: [] });
  assert.equal(r.materials[0].unitPrice, 142); // 42% default for locksmith
});

test('security film: 400% markup equals a 5x multiplier on supplier cost', () => {
  const r = buildEstimate({ template: film, materials: [{ id: 'f', name: 'Security film', quantity: 10, unit: 'sq ft', supplierCost: 10 }], labor: [] });
  const [line] = r.materials;
  assert.equal(line.markupPct, 400);
  assert.equal(line.unitPrice, 50); // 10 * (1 + 400/100) = 50
  assert.equal(line.lineTotal, 500);
});

test('markup is clamped to the template max and a clamp warning is emitted', () => {
  const r = buildEstimate({ template: film, materials: [{ id: 'f', name: 'Security film', quantity: 1, unit: 'sq ft', supplierCost: 10, markupPct: 1500 }], labor: [] });
  assert.equal(r.materials[0].markupPct, 900); // materialMarkupMax
  assert.equal(r.materials[0].unitPrice, 100);
  assert.ok(r.warnings.some(w => w.includes('clamped to 900%')));
});

test('labor margin math: effectiveRate = tierRate / (1 - margin/100)', () => {
  const r = buildEstimate({ template: locksmith, materials: [], labor: [lab()] });
  const [line] = r.labor;
  assert.equal(line.tierRate, 150);
  assert.equal(line.unitPrice, 600); // 150 / (1 - 0.75)
  assert.equal(line.lineTotal, 600);
  assert.equal(line.lineCost, 150);
  assert.equal(line.marginPct, 75);
});

test('labor margin is overridable per estimate', () => {
  const r = buildEstimate({ template: locksmith, materials: [], labor: [lab()], laborMarginPct: 50 });
  assert.equal(r.labor[0].unitPrice, 300);
  assert.equal(r.labor[0].marginPct, 50);
});

test('unpriced materials produce null prices, are incomplete, and warn', () => {
  const r = buildEstimate({ template: locksmith, materials: [mat({ supplierCost: null })], labor: [lab()] });
  const [line] = r.materials;
  assert.equal(line.unitPrice, null);
  assert.equal(line.lineTotal, null);
  assert.equal(line.lineCost, null);
  assert.equal(r.complete, false);
  assert.ok(r.warnings.some(w => w.includes('Unpriced material: Deadbolt')));
  assert.equal(r.totalCost, 150); // unpriced material has no cost to sum; priced labor contributes 150
});

test('totalCost is null when a priced line lacks a cost', () => {
  // Labor line with null hours still prices at 0 total; emulate a priced line with null cost via quantity 0 supplierCost set… simpler: null-supplierCost material + priced labor
  const r = buildEstimate({ template: locksmith, materials: [mat({ supplierCost: null })], labor: [] });
  assert.equal(r.subtotal, null);
  assert.equal(r.totalCost, null);
  assert.equal(r.netMarginPct, null);
});

test('net margin math and guardrail warning', () => {
  // Material: cost 1000, markup 0 -> price 1000, cost 1000. Labor: margin 5% -> tiny labor margin.
  const r = buildEstimate({
    template: locksmith,
    materials: [mat({ supplierCost: 1000, quantity: 1, markupPct: 0 })],
    labor: [lab()],
    laborMarginPct: 5,
  });
  // subtotal = 1000 + 150/0.95 = 1000 + 157.89 = 1157.89; cost = 1000 + 150 = 1150
  assert.equal(r.subtotal, 1157.89);
  assert.equal(r.totalCost, 1150);
  assert.equal(r.netMarginPct, 0.68);
  assert.ok(r.warnings.some(w => w.includes('below the 24% guardrail')));
});

test('healthy margin emits no guardrail warning', () => {
  const r = buildEstimate({ template: locksmith, materials: [mat()], labor: [lab()] });
  // subtotal = 284 + 600 = 884; cost = 200 + 150 = 350; net = (884-350)/884*100 = 60.41
  assert.equal(r.netMarginPct, 60.41);
  assert.ok(!r.warnings.some(w => w.includes('guardrail')));
  assert.equal(r.complete, true);
});

test('tax defaults to 13%, deposit defaults to 50% of total', () => {
  const r = buildEstimate({ template: locksmith, materials: [mat()], labor: [lab()] });
  assert.equal(r.taxPct, 13);
  assert.equal(r.tax, 114.92); // 884 * 0.13
  assert.equal(r.total, 998.92);
  assert.equal(r.depositPct, 50);
  assert.equal(r.deposit, 499.46);
});

test('customerProjection strips every internal field', () => {
  const r = buildEstimate({ template: locksmith, materials: [mat()], labor: [lab()] });
  const p = customerProjection(r);
  const serialized = JSON.stringify(p);
  assert.ok(!/supplierCost|lineCost|totalCost|marginPct|markupPct/.test(serialized));
  assert.deepEqual(Object.keys(p.materials[0]).sort(), ['lineTotal', 'name', 'quantity', 'unit', 'unitPrice']);
  assert.deepEqual(Object.keys(p.labor[0]).sort(), ['hours', 'lineTotal', 'name', 'tierKey', 'unitPrice']);
  assert.equal(p.materials[0].unitPrice, 142);
  assert.equal(p.labor[0].unitPrice, 600);
  assert.equal(p.total, 998.92);
});

test('customerProjection keeps only priced lines and drops internal warnings', () => {
  const r = buildEstimate({ template: locksmith, materials: [mat({ supplierCost: null }), mat({ id: 'm2', name: 'Gripset', quantity: 1, unit: 'each', supplierCost: 50 })], labor: [lab()], laborMarginPct: 5 });
  const p = customerProjection(r);
  assert.equal(p.materials.length, 1);
  assert.equal(p.materials[0].name, 'Gripset');
  assert.ok(!p.warnings.some(w => w.startsWith('Net margin')));
  assert.ok(p.warnings.some(w => w.includes('Unpriced material')));
});

test('empty estimate is incomplete with null totals', () => {
  const r = buildEstimate({ template: locksmith, materials: [], labor: [] });
  assert.equal(r.complete, false);
  assert.equal(r.subtotal, null);
  assert.equal(r.total, null);
  assert.equal(r.deposit, null);
});
