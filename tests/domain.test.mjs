import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const code = stripTypeScriptTypes(fs.readFileSync(new URL('../app/lib/domain.ts', import.meta.url), 'utf8'));
const { squareFeet, totals, closestTechnician, hasCoordinates, approvedSupplierUrl } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const domainUrl = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const draftCode = stripTypeScriptTypes(fs.readFileSync(new URL('../app/lib/free-drafts.ts', import.meta.url), 'utf8')).replace("'./domain'", JSON.stringify(domainUrl));
const { freeRequest, freeEstimate } = await import('data:text/javascript;base64,' + Buffer.from(draftCode).toString('base64'));

test('free request extracts explicit fields without inventing a client', () => {
  assert.equal(freeRequest('Loose gripset, matte black', 'Locksmith').client.name, '');
  const draft = freeRequest('Name: Jane\nRole: tenant\nPhone: 555-1234\nAddress: 10 Main Street', 'Locksmith');
  assert.equal(draft.client.name, 'Jane');
  assert.equal(draft.client.role, 'tenant');
  assert.equal(draft.client.email, '');
});
test('free estimate preserves template scope and requires confirmed prices', () => {
  const draft = freeEstimate('Replace glass', 'Windows', { name: 'Glass Replacement', description: 'Remove damaged glass.' }, 36, 48, 3);
  assert.equal(draft.lines[1].quantity, 36);
  assert.equal(draft.lines[1].unit, 'sq ft');
  assert.ok(draft.lines.every(line => line.price === null && line.cost === null));
  assert.deepEqual(draft.products, []);
  assert.match(draft.scope, /Remove damaged glass/);
});
test('square footage multiplies both inch dimensions and count', () => {
  assert.equal(squareFeet(72, 80), 40);
  assert.equal(squareFeet(36, 48, 3), 36);
  assert.equal(squareFeet(0, 48), 0);
  assert.equal(squareFeet(-1, 48), 0);
  assert.equal(squareFeet(NaN, 48), 0);
});
test('Canadian estimate totals round each item before tax and deposit', () => {
  assert.deepEqual(totals([{ quantity: 2, price: 50.005 }], 13, 25), { subtotal: 100.01, tax: 13, total: 113.01, deposit: 28.25 });
});
test('assignment requires matching specialty and fresh location', () => {
  const now = Date.parse('2026-10-03T15:00:00Z'), updated = '2026-10-03T14:55:00Z';
  const base = { active: true, latitude: 43.7, longitude: -79.4, location_updated_at: updated };
  const techs = [{ ...base, id: 'wrong', specialties: ['Windows'] }, { ...base, id: 'stale', specialties: ['Locksmith'], location_updated_at: '2026-10-03T13:00:00Z' }, { ...base, id: 'right', specialties: ['locksmith'], latitude: 43.8 }];
  assert.equal(closestTechnician(techs, 'Locksmith', { latitude: 43.7, longitude: -79.4 }, now).id, 'right');
  assert.equal(closestTechnician(techs, 'Locksmith', { latitude: null, longitude: null }, now), null);
  assert.equal(closestTechnician([{ ...base, specialties: ['general'] }], 'Doors', { latitude: 43.7, longitude: -79.4 }, now), null);
});
test('coordinates accept zero but reject missing and out-of-range positions', () => {
  assert.equal(hasCoordinates({ latitude: 0, longitude: 0 }), true);
  assert.equal(hasCoordinates({ latitude: null, longitude: 0 }), false);
  assert.equal(hasCoordinates({ latitude: 91, longitude: 0 }), false);
});
test('supplier sources are restricted to HTTPS Canadian retailers', () => {
  assert.equal(approvedSupplierUrl('https://www.amazon.ca/dp/example'), true);
  assert.equal(approvedSupplierUrl('https://www.homedepot.ca/product/example'), true);
  assert.equal(approvedSupplierUrl('https://amazon.ca.evil.example/product'), false);
  assert.equal(approvedSupplierUrl('javascript:alert(1)'), false);
});
