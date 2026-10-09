import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

// classify.ts moved to @yavamo/core (packages/core/src/classify.ts) on 2026-10-09.
// Windows is out of scope: the 'windows' key, its questions and its keyword
// signals were removed — SERVICE_QUESTIONS now covers the 4 in-scope services.
const classifyUrl = 'data:text/javascript;base64,' + Buffer.from(
  stripTypeScriptTypes(fs.readFileSync(new URL('../packages/core/src/classify.ts', import.meta.url), 'utf8'))
).toString('base64');

const {
  isOutOfScope,
  hasExtension,
  isBusinessHours,
  SERVICE_QUESTIONS,
  buildInquiryDraft,
  buildAfterHoursDraft,
  buildDeclineDraft,
  classifyAssist,
} = await import(classifyUrl);

// ---- isOutOfScope ----

test('out-of-scope: key fob', () => {
  const r = isOutOfScope('my key fob stopped working');
  assert.equal(r.out, true);
  assert.equal(r.reason, 'key fob');
});

test('out-of-scope: ignition', () => {
  const r = isOutOfScope("ignition won't turn");
  assert.equal(r.out, true);
  assert.equal(r.reason, 'ignition');
});

test('out-of-scope: small appliances', () => {
  assert.equal(isOutOfScope('toaster repair').out, true);
  assert.equal(isOutOfScope('can you fix my air fryer?').out, true);
  assert.equal(isOutOfScope('kettle stopped heating').out, true);
  assert.equal(isOutOfScope('blender blade replacement').out, true);
  assert.equal(isOutOfScope('countertop microwave not working').out, true);
});

test('out-of-scope: access control systems', () => {
  const r = isOutOfScope('install an access control system for our office');
  assert.equal(r.out, true);
  assert.equal(r.reason, 'access control system');
});

test('in-scope work is not flagged: deadbolt, window film, door lock', () => {
  assert.deepEqual(isOutOfScope('deadbolt replacement'), { out: false, reason: null });
  assert.deepEqual(isOutOfScope('window film for storefront'), { out: false, reason: null });
  assert.deepEqual(isOutOfScope('door lock is sticking'), { out: false, reason: null });
  assert.deepEqual(isOutOfScope('smart lock installation'), { out: false, reason: null });
});

test('tricky pair: price inquiry vs job request are both in-scope', () => {
  // "how much for a deadbolt?" is an inquiry; "need deadbolt replaced at 123 Main St"
  // is a request — both are in-scope locksmith work, neither is out-of-scope.
  assert.equal(isOutOfScope('how much for a deadbolt?').out, false);
  assert.equal(isOutOfScope('need deadbolt replaced at 123 Main St').out, false);
  assert.equal(classifyAssist('how much for a deadbolt?').service, 'locksmith');
  assert.equal(classifyAssist('need deadbolt replaced at 123 Main St').service, 'locksmith');
});

// ---- classifyAssist ----

test('classifyAssist guesses security_film for window film', () => {
  const r = classifyAssist('window film for storefront');
  assert.equal(r.service, 'security_film');
  assert.ok(r.signals.length > 0);
});

test('classifyAssist returns null for out-of-scope messages', () => {
  assert.deepEqual(classifyAssist('my key fob stopped working'), { service: null, signals: [] });
});

test('classifyAssist returns null when nothing matches', () => {
  assert.deepEqual(classifyAssist('hello, just saying hi'), { service: null, signals: [] });
});

test('classifyAssist returns null on an ambiguous tie (door lock)', () => {
  // "door" (doors) vs "lock" (locksmith) tie — honestly ambiguous, so null.
  const r = classifyAssist('door lock repair');
  assert.equal(r.service, null);
});

test('classifyAssist picks the strict winner with multiple signals', () => {
  const r = classifyAssist('need two deadbolts rekeyed, I am locked out');
  assert.equal(r.service, 'locksmith');
  assert.ok(r.signals.includes('deadbolt'));
});

// ---- hasExtension ----

test('hasExtension detects x / ext / extension / # suffixes', () => {
  assert.equal(hasExtension('416-555-0100 x204'), true);
  assert.equal(hasExtension('4165550100 ext. 12'), true);
  assert.equal(hasExtension('(416) 555-0100 extension 45'), true);
  assert.equal(hasExtension('416-555-0100 #99'), true);
});

test('hasExtension is false for plain numbers and empty input', () => {
  assert.equal(hasExtension('416-555-0100'), false);
  assert.equal(hasExtension(''), false);
  assert.equal(hasExtension('   '), false);
});

// ---- isBusinessHours ----
// Fixed instants: 2026-10-06 is a Tuesday, 2026-10-11 a Sunday (EDT = UTC-4).

test('isBusinessHours: Tuesday 10:00 Toronto is in hours', () => {
  assert.equal(isBusinessHours(new Date('2026-10-06T14:00:00Z')), true);
});

test('isBusinessHours: Monday 9:00 Toronto is in hours (opening edge)', () => {
  assert.equal(isBusinessHours(new Date('2026-10-05T13:00:00Z')), true);
});

test('isBusinessHours: Sunday 12:00 Toronto is after hours', () => {
  assert.equal(isBusinessHours(new Date('2026-10-11T16:00:00Z')), false);
});

test('isBusinessHours: weekday 18:30 Toronto is after hours', () => {
  assert.equal(isBusinessHours(new Date('2026-10-07T22:30:00Z')), false);
});

test('isBusinessHours: Friday 17:00 Toronto is after hours (closing edge)', () => {
  assert.equal(isBusinessHours(new Date('2026-10-09T21:00:00Z')), false);
});

// ---- SERVICE_QUESTIONS ----

test('SERVICE_QUESTIONS covers the 4 in-scope services with 3-5 practical questions each', () => {
  for (const key of ['doors', 'security_film', 'locksmith', 'skincare']) {
    const qs = SERVICE_QUESTIONS[key];
    assert.ok(Array.isArray(qs), key);
    assert.ok(qs.length >= 3 && qs.length <= 5, `${key} has ${qs.length} questions`);
    assert.ok(qs.every(q => typeof q === 'string' && q.length > 0), key);
  }
});

// ---- draft builders ----

test('buildInquiryDraft: non-empty subject/body, mentions photos, lists service questions', () => {
  const d = buildInquiryDraft({ name: 'Dana', service: 'locksmith' });
  assert.ok(d.subject.length > 0 && d.body.length > 0);
  assert.ok(d.body.includes('Dana'));
  assert.ok(/photo/i.test(d.body), 'mentions photos');
  assert.ok(d.body.includes('lock area'), 'photos are scoped to the service area');
  assert.ok(d.body.includes('How many locks are involved?'));
  assert.ok(d.body.includes('please call us directly'), 'urgent line present');
  assert.ok(!/[$]\d/.test(d.body), 'never invents pricing');
});

test('buildInquiryDraft falls back to generic questions for unknown services', () => {
  const d = buildInquiryDraft({ name: 'Dana', service: 'plumbing' });
  assert.ok(d.body.includes('Can you describe the work'));
});

test('buildAfterHoursDraft: closed message with hours and morning response', () => {
  const d = buildAfterHoursDraft({ name: 'Dana' });
  assert.ok(d.subject.length > 0 && d.body.length > 0);
  assert.ok(d.body.includes('Dana'));
  assert.ok(d.body.includes('9 AM'), 'states office hours');
  assert.ok(/monday to friday/i.test(d.body));
  assert.ok(/morning/i.test(d.body), 'promises a morning response');
});

test('buildDeclineDraft: polite, names the reason, never promises future availability', () => {
  const d = buildDeclineDraft({ name: 'Dana', reason: 'key fob' });
  assert.ok(d.subject.length > 0 && d.body.length > 0);
  assert.ok(d.body.includes("don't have anyone available at this time"));
  assert.ok(d.body.includes('key fob'));
  assert.ok(d.body.includes('security film'), 'lists in-scope services');
  assert.ok(!/will (contact|reach out|follow up)/i.test(d.body), 'no future-availability promise');
});

test('buildDeclineDraft works with a null reason', () => {
  const d = buildDeclineDraft({ name: 'Dana', reason: null });
  assert.ok(d.body.includes('this type of request'));
});
