import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

// assessCompletion moved to @yavamo/core (packages/core/src/classify.ts) on 2026-10-09.
const guardUrl = 'data:text/javascript;base64,' + Buffer.from(
  stripTypeScriptTypes(fs.readFileSync(new URL('../packages/core/src/classify.ts', import.meta.url), 'utf8'))
).toString('base64');

const { assessCompletion } = await import(guardUrl);

test('note recorded after visit start is valid', () => {
  const r = assessCompletion({
    visitStartedAt: '2026-10-08T10:00:00-04:00',
    noteEvents: [{ at: '2026-10-08T10:15:00-04:00' }],
    photoFiles: [],
  });
  assert.equal(r.valid, true);
  assert.ok(r.reason.length > 0);
});

test('photo recorded after visit start is valid', () => {
  const r = assessCompletion({
    visitStartedAt: '2026-10-08T10:00:00-04:00',
    noteEvents: [],
    photoFiles: [{ at: '2026-10-08T10:30:00-04:00' }],
  });
  assert.equal(r.valid, true);
});

test('only events before visit start are invalid (accidental tap)', () => {
  const r = assessCompletion({
    visitStartedAt: '2026-10-08T10:00:00-04:00',
    noteEvents: [{ at: '2026-10-08T09:00:00-04:00' }],
    photoFiles: [{ at: '2026-10-07T12:00:00-04:00' }],
  });
  assert.equal(r.valid, false);
  assert.ok(/accidental tap/.test(r.reason));
});

test('no notes or photos at all is invalid', () => {
  const r = assessCompletion({ visitStartedAt: '2026-10-08T10:00:00-04:00', noteEvents: [], photoFiles: [] });
  assert.equal(r.valid, false);
  assert.ok(/accidental tap/.test(r.reason));
});

test('null visitStartedAt with a photo is valid', () => {
  const r = assessCompletion({
    visitStartedAt: null,
    noteEvents: [],
    photoFiles: [{ at: '2026-10-08T10:30:00-04:00' }],
  });
  assert.equal(r.valid, true);
});

test('null visitStartedAt with no events is invalid', () => {
  const r = assessCompletion({ visitStartedAt: null, noteEvents: [], photoFiles: [] });
  assert.equal(r.valid, false);
});

test('unparseable timestamps are ignored', () => {
  const r = assessCompletion({
    visitStartedAt: '2026-10-08T10:00:00-04:00',
    noteEvents: [{ at: 'not-a-date' }],
    photoFiles: [],
  });
  assert.equal(r.valid, false);
});
