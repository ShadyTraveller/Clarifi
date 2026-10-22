import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

// Load the canonical modules directly (same pattern as tests/estimate.test.mjs):
// pricing.ts is the shared base; sections.ts and job-report.ts import from it.
const pricingUrl = 'data:text/javascript;base64,' + Buffer.from(
  stripTypeScriptTypes(fs.readFileSync(new URL('../packages/core/src/pricing.ts', import.meta.url), 'utf8'))
).toString('base64');

const sectionsCode = stripTypeScriptTypes(
  fs.readFileSync(new URL('../packages/core/src/sections.ts', import.meta.url), 'utf8')
).replaceAll("'./pricing'", JSON.stringify(pricingUrl));
const sections = await import('data:text/javascript;base64,' + Buffer.from(sectionsCode).toString('base64'));
const { laborUnitFromTier, priceSectionLine, priceSectionedEstimate, sectionCustomerProjection } = sections;

const reportCode = stripTypeScriptTypes(
  fs.readFileSync(new URL('../app/lib/job-report.ts', import.meta.url), 'utf8')
).replaceAll("'@yavamo/core'", JSON.stringify(pricingUrl));
const report = await import('data:text/javascript;base64,' + Buffer.from(reportCode).toString('base64'));
const { jobProgress, summarizeJobBudget, classifyJobFile } = report;

function line(overrides = {}) {
  return {
    id: 'l1', task: 'Task', quantity: 1, unit: 'each', materialCost: 0,
    laborUnit: 0, laborHoursPerUnit: 0, tierKey: 'priority', markupPct: 0,
    source: 'manual', sourceNote: '', needsReview: false, ...overrides,
  };
}

test('labour unit derives from the shared tier table', () => {
  assert.equal(laborUnitFromTier('priority', 0.5), 90);   // $180 × 0.5h
  assert.equal(laborUnitFromTier('emergency', 1), 220);   // $220 × 1h
  assert.equal(laborUnitFromTier('standard', 2), 300);    // $150 × 2h
});

test('Billdr formula: qty × (material + labor) × (1 + markup)', () => {
  // Rows taken from the Billdr screenshot Lavie supplied.
  const wall = priceSectionLine(line({ quantity: 200, unit: 'sq.ft', materialCost: 1.5, laborUnit: 1.13, markupPct: 25 }));
  assert.equal(wall.lineTotal, 657.50);
  const framing = priceSectionLine(line({ quantity: 320, unit: 'sq.ft', materialCost: 16.17, laborUnit: 24, markupPct: 35 }));
  assert.equal(framing.lineTotal, 17353.44);
  const prep = priceSectionLine(line({ quantity: 1, materialCost: 300, laborUnit: 225, markupPct: 0 }));
  assert.equal(prep.lineTotal, 525);
});

test('unpriced lines stay null, flag the estimate incomplete, and surface a flag', () => {
  const result = priceSectionedEstimate([
    { id: 's1', title: 'S', lines: [line({ id: 'a', task: 'Priced', materialCost: 10 }), line({ id: 'b', task: 'Edge sealant', materialCost: null, source: 'placeholder', needsReview: true, reviewNote: 'Office to price.' })] },
  ]);
  assert.equal(result.complete, false);
  assert.equal(result.subtotal, 10);
  assert.ok(result.flags.some(f => f.includes('Edge sealant')));
});

test('section rollup: subtotal, tax, total and estimated hours', () => {
  const result = priceSectionedEstimate([
    { id: 's1', title: 'Labour', lines: [line({ quantity: 2, unit: 'lock', laborUnit: 90, laborHoursPerUnit: 0.5, markupPct: 300 })] },
  ], 13);
  assert.equal(result.sections[0].subtotal, 720); // 2 × 90 × 4.00
  assert.equal(result.sections[0].estHours, 1);
  assert.equal(result.tax, 93.6);
  assert.equal(result.total, 813.6);
  assert.equal(result.complete, true);
});

test('client projection strips every internal field', () => {
  const result = priceSectionedEstimate([
    { id: 's1', title: 'S', lines: [line({ materialCost: 59.98, laborUnit: 180, markupPct: 65, sourceNote: 'Home Depot Canada — internal' })] },
  ]);
  const projection = sectionCustomerProjection(result);
  const json = JSON.stringify(projection);
  for (const banned of ['materialCost', 'laborUnit', 'markupPct', 'supplierCost', 'sourceNote', 'tierKey', 'unit_cost']) {
    assert.ok(!json.includes(banned), `projection leaked ${banned}`);
  }
  assert.equal(projection.sections[0].lines[0].lineTotal, result.sections[0].lines[0].lineTotal);
});

test('job progress derives from the existing status enum', () => {
  assert.deepEqual(
    ['lead', 'estimate', 'active', 'completed'].map(s => jobProgress(s).pct),
    [25, 50, 75, 100],
  );
  assert.equal(jobProgress('completed').label, 'Completed');
});

test('budget summary uses only real quote/invoice records', () => {
  const quotes = [
    { id: 'q1', quote_number: 'Q-1', status: 'sent', created_at: '2026-10-02T00:00:00Z', quote_versions: [{ version_number: 1, subtotal: 900, tax: 117, total: 1017 }] },
    { id: 'q2', quote_number: 'Q-2', status: 'approved', created_at: '2026-10-01T00:00:00Z', quote_versions: [{ version_number: 1, subtotal: 1000, tax: 130, total: 1130 }, { version_number: 2, subtotal: 1100, tax: 143, total: 1243 }] },
  ];
  const invoices = [
    { id: 'i1', invoice_number: 'INV-1', status: 'sent', total: 500, due_at: null, paid_at: null, created_at: '2026-10-03T00:00:00Z' },
    { id: 'i2', invoice_number: 'INV-2', status: 'paid', total: 300, due_at: null, paid_at: '2026-10-04T00:00:00Z', created_at: '2026-10-03T00:00:00Z' },
    { id: 'i3', invoice_number: 'INV-3', status: 'draft', total: 999, due_at: null, paid_at: null, created_at: '2026-10-03T00:00:00Z' },
    { id: 'i4', invoice_number: 'INV-4', status: 'voided', total: 777, due_at: null, paid_at: null, created_at: '2026-10-03T00:00:00Z' },
  ];
  const b = summarizeJobBudget(quotes, invoices);
  assert.equal(b.contractTotal, 1243);        // approved quote, LATEST version
  assert.equal(b.contractQuoteNumber, 'Q-2');
  assert.equal(b.latestEstimateTotal, 1017); // newest quote overall
  assert.equal(b.invoiced, 800);              // sent + paid only; draft/voided excluded
  assert.equal(b.paid, 300);                  // invoices with status 'paid' only
  assert.equal(b.balance, 500);
  assert.equal(b.draftInvoiceCount, 1);
});

test('file grouping comes from mime type and file name metadata', () => {
  assert.equal(classifyJobFile({ file_name: 'front-door.jpg', mime_type: 'image/jpeg' }), 'photos');
  assert.equal(classifyJobFile({ file_name: 'scan.png', mime_type: 'application/pdf' }), 'other'); // mime wins only for images; name has no keyword
  assert.equal(classifyJobFile({ file_name: 'Invoice-1042.pdf', mime_type: 'application/pdf' }), 'invoices');
  assert.equal(classifyJobFile({ file_name: 'Quote Q-12.pdf', mime_type: 'application/pdf' }), 'estimates');
  assert.equal(classifyJobFile({ file_name: 'signed-approval.pdf', mime_type: 'application/pdf' }), 'approvals');
  assert.equal(classifyJobFile({ file_name: 'COI certificate.pdf', mime_type: 'application/pdf' }), 'approvals');
  assert.equal(classifyJobFile({ file_name: 'notes.txt', mime_type: 'text/plain' }), 'other');
});
