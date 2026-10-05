import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

// google-form.ts is dependency-free pure TS — strip types and import directly.
const code = stripTypeScriptTypes(fs.readFileSync(new URL('../app/lib/google-form.ts', import.meta.url), 'utf8'));
const { mapFormResponses, mapRoleAnswer, answerToString } = await import(
  'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
);

test('maps the four verified page-1 fields', () => {
  const m = mapFormResponses({
    Email: 'Test@Example.com ',
    Name: 'Maria Lopez',
    Number: '416-555-0123',
    Address: '25 King St\nToronto',
  });
  assert.equal(m.email, 'test@example.com');
  assert.equal(m.emailValid, true);
  assert.equal(m.name, 'Maria Lopez');
  assert.equal(m.phone, '416-555-0123');
  assert.equal(m.address, '25 King St\nToronto');
  assert.equal(m.extras.length, 0);
});

test('maps page-2 role precisely, including institution', () => {
  for (const [answer, expected] of [
    ['tenant', 'tenant'],
    ['landlord', 'landlord'],
    ['property management', 'property_management'],
    ['institution', 'institution'],
    ['commercial', 'commercial'],
    ['Property Management', 'property_management'],
  ]) {
    const m = mapFormResponses({ Name: 'A', Role: answer });
    assert.equal(m.role, expected, `role answer "${answer}"`);
  }
});

test('unknown role answer falls back to other but keeps the raw label', () => {
  const m = mapFormResponses({ Name: 'A', Role: 'mystery org' });
  assert.equal(m.role, 'other');
  assert.equal(m.roleRaw, 'mystery org');
  assert.match(m.details, /mystery org/);
});

test('job details answer lands in details and markdown', () => {
  const m = mapFormResponses({ Name: 'A', 'Job details': 'Leaky faucet in kitchen.' });
  assert.equal(m.jobDetails, 'Leaky faucet in kitchen.');
  assert.match(m.details, /## Job details\nLeaky faucet in kitchen\./);
  assert.match(m.markdown, /Leaky faucet in kitchen\./);
});

test('dynamic fallback: unknown titles are never dropped and never fail', () => {
  const m = mapFormResponses({
    Name: 'A',
    'Preferred contact time': 'Evenings',
    'How did you hear about us?': ['Google', 'Friend'],
    'Weird new question (page 2 v2)': 'surprise!',
    '': 'blank title ignored',
  });
  const titles = m.extras.map((e) => e.title);
  assert.ok(titles.includes('Preferred contact time'));
  assert.ok(titles.includes('How did you hear about us?'));
  assert.ok(titles.includes('Weird new question (page 2 v2)'));
  const hear = m.extras.find((e) => e.title === 'How did you hear about us?');
  assert.equal(hear.answer, 'Google, Friend');
  assert.match(m.details, /surprise!/);
});

test('invalid email is flagged, normalized out, and preserved raw', () => {
  const m = mapFormResponses({ Name: 'A', Email: 'not-an-email' });
  assert.equal(m.emailValid, false);
  assert.equal(m.email, '');
  assert.equal(m.emailRaw, 'not-an-email');
  assert.match(m.details, /needs verification/);
});

test('attachment count is noted in details', () => {
  const m = mapFormResponses({ Name: 'A' }, 3);
  assert.equal(m.attachmentCount, 3);
  assert.match(m.details, /3 photo\(s\) attached/);
});

test('title always builds even with missing name', () => {
  const m = mapFormResponses({});
  assert.equal(m.title, 'Website intake — New client');
  assert.equal(m.role, 'other');
});

test('answerToString handles arrays, nulls, numbers', () => {
  assert.equal(answerToString(['a', 'b']), 'a, b');
  assert.equal(answerToString(null), '');
  assert.equal(answerToString(42), '42');
  assert.equal(answerToString('  x  '), 'x');
});

test('mapRoleAnswer is case-insensitive', () => {
  assert.equal(mapRoleAnswer('INSTITUTION').role, 'institution');
  assert.equal(mapRoleAnswer('Tenant').role, 'tenant');
});
