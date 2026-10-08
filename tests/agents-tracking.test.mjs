import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const trackingUrl = 'data:text/javascript;base64,' + Buffer.from(
  stripTypeScriptTypes(fs.readFileSync(new URL('../app/lib/agents/tracking.ts', import.meta.url), 'utf8'))
).toString('base64');

const { detectCarrier, normalizeStatus, shouldNotifyOffice } = await import(trackingUrl);

// ---- detectCarrier ----

test('detects UPS 1Z numbers', () => {
  assert.equal(detectCarrier('1Z999AA10123456784'), 'ups');
  assert.equal(detectCarrier(' 1Z999AA10123456784 '), 'ups'); // spaces trimmed
});

test('detects Amazon Logistics TBA numbers', () => {
  assert.equal(detectCarrier('TBA123456789012'), 'amazon-logistics');
});

test('detects FedEx 12/15/20-digit numbers', () => {
  assert.equal(detectCarrier('463590123456'), 'fedex'); // 12-digit starting 4
  assert.equal(detectCarrier('123456789012345'), 'fedex'); // 15-digit
  assert.equal(detectCarrier('96123456789012345678'), 'fedex'); // 20-digit starting 96
});

test('detects Canada Post 16-digit and S10 numbers', () => {
  assert.equal(detectCarrier('1234567890123456'), 'canada-post');
  assert.equal(detectCarrier('LX123456789CA'), 'canada-post');
});

test('detects Purolator PIN formats', () => {
  assert.equal(detectCarrier('KYV009956937'), 'purolator'); // 3 letters + 9 digits
  assert.equal(detectCarrier('331426749957'), 'purolator'); // 12 digits starting 33
});

test('detects Dragonfly DF-prefix numbers (best-effort)', () => {
  assert.equal(detectCarrier('DF1234567890'), 'dragonfly');
});

test('returns unknown instead of guessing', () => {
  assert.equal(detectCarrier('123456789012'), 'unknown'); // ambiguous 12-digit (FedEx vs Purolator)
  assert.equal(detectCarrier('not-a-tracking-number'), 'unknown');
  assert.equal(detectCarrier(''), 'unknown');
  assert.equal(detectCarrier('   '), 'unknown');
});

// ---- normalizeStatus ----

test('normalizeStatus maps common carrier phrases', () => {
  assert.equal(normalizeStatus('Out for delivery'), 'out_for_delivery');
  assert.equal(normalizeStatus('Delivered to recipient'), 'delivered');
  assert.equal(normalizeStatus('Delivery exception - delayed'), 'exception');
  assert.equal(normalizeStatus('Your package is delayed'), 'exception');
  assert.equal(normalizeStatus('In transit - departed facility'), 'in_transit');
  assert.equal(normalizeStatus('Arrived at depot'), 'in_transit');
  assert.equal(normalizeStatus('Shipment on the way'), 'in_transit');
});

test('normalizeStatus returns unknown for unmapped phrases', () => {
  assert.equal(normalizeStatus('Some brand-new status nobody has seen'), 'unknown');
  assert.equal(normalizeStatus(''), 'unknown');
});

// ---- shouldNotifyOffice ----

test('in_transit -> out_for_delivery notifies', () => {
  assert.equal(shouldNotifyOffice('in_transit', 'out_for_delivery', null, null), true);
});

test('delivered -> delivered does not notify (no change)', () => {
  assert.equal(shouldNotifyOffice('delivered', 'delivered', null, null), false);
});

test('null -> in_transit does not notify', () => {
  assert.equal(shouldNotifyOffice(null, 'in_transit', null, null), false);
});

test('out_for_delivery -> delivered notifies', () => {
  assert.equal(shouldNotifyOffice('out_for_delivery', 'delivered', null, null), true);
});

test('in_transit -> exception notifies', () => {
  assert.equal(shouldNotifyOffice('in_transit', 'exception', null, null), true);
});

test('ETA calendar-date change notifies even when status is unchanged', () => {
  assert.equal(
    shouldNotifyOffice('in_transit', 'in_transit', '2026-10-10', '2026-10-12'),
    true,
  );
});

test('same ETA date does not notify', () => {
  assert.equal(
    shouldNotifyOffice('in_transit', 'in_transit', '2026-10-10', '2026-10-10T23:59:00'),
    false,
  );
});

test('ETA appearing from nothing notifies', () => {
  assert.equal(shouldNotifyOffice(null, 'in_transit', null, '2026-10-10'), true);
});
