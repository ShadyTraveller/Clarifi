import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

// Same loader pattern as tests/sections.test.mjs: job-report.ts imports
// roundMoney from '@yavamo/core', which resolves to packages/core pricing.
const pricingUrl = 'data:text/javascript;base64,' + Buffer.from(
  stripTypeScriptTypes(fs.readFileSync(new URL('../packages/core/src/pricing.ts', import.meta.url), 'utf8'))
).toString('base64');

const reportCode = stripTypeScriptTypes(
  fs.readFileSync(new URL('../app/lib/job-report.ts', import.meta.url), 'utf8')
).replaceAll("'@yavamo/core'", JSON.stringify(pricingUrl));
const report = await import('data:text/javascript;base64,' + Buffer.from(reportCode).toString('base64'));
const {
  fileCaption,
  isMissingSharingColumnError,
  normalizeJobFile,
  projectFilesForClient,
} = report;

function file(overrides = {}) {
  return {
    id: 'f1',
    organization_id: 'org-secret',
    job_id: 'job-1',
    client_id: 'client-1',
    storage_path: 'org/job/f1.jpg',
    file_name: 'site-photo.jpg',
    mime_type: 'image/jpeg',
    created_at: '2026-10-21T12:00:00Z',
    client_visible: false,
    caption: null,
    ...overrides,
  };
}

test('client projection includes only files shared with the client', () => {
  const files = [
    file({ id: 'a', file_name: 'shared.jpg', client_visible: true }),
    file({ id: 'b', file_name: 'internal-quote.pdf', client_visible: false }),
    file({ id: 'c', file_name: 'unset-flag.jpg' }),
  ];
  delete files[2].client_visible; // pre-migration row: flag absent entirely
  const projected = projectFilesForClient(files);
  assert.deepEqual(projected.map(f => f.id), ['a']);
});

test('client projection leaks nothing about unshared files — not even names', () => {
  const files = [
    file({ id: 'a', file_name: 'shared.jpg', client_visible: true }),
    file({ id: 'b', file_name: 'internal-margin-sheet.pdf', client_visible: false, storage_path: 'org/job/secret.pdf' }),
  ];
  const projected = projectFilesForClient(files);
  const serialized = JSON.stringify(projected);
  assert.ok(!serialized.includes('internal-margin-sheet'));
  assert.ok(!serialized.includes('secret.pdf'));
  assert.ok(projected.every(f => f.id !== 'b'));
});

test('client projection strips internal fields from shared files', () => {
  const [projected] = projectFilesForClient([file({ client_visible: true })]);
  assert.deepEqual(
    Object.keys(projected).sort(),
    ['caption', 'created_at', 'file_name', 'id', 'mime_type', 'storage_path'],
  );
  assert.ok(!('organization_id' in projected));
  assert.ok(!('client_id' in projected));
  assert.ok(!('job_id' in projected));
  assert.ok(!('client_visible' in projected));
});

test('caption resolution: stored caption wins, blank or missing falls back to the file name', () => {
  assert.equal(fileCaption(file({ caption: 'Front door, before' })), 'Front door, before');
  assert.equal(fileCaption(file({ caption: '   ' })), 'site-photo.jpg');
  assert.equal(fileCaption(file({ caption: null })), 'site-photo.jpg');
  const [projected] = projectFilesForClient([file({ client_visible: true, caption: 'After: new deadbolt' })]);
  assert.equal(projected.caption, 'After: new deadbolt');
});

test('normalizeJobFile defaults pre-migration rows to office-only and uncaptioned', () => {
  const bare = file();
  delete bare.client_visible;
  delete bare.caption;
  const normalized = normalizeJobFile(bare);
  assert.equal(normalized.client_visible, false);
  assert.equal(normalized.caption, null);
  assert.equal(projectFilesForClient([normalized]).length, 0);
  assert.equal(normalizeJobFile(file({ caption: '  ' })).caption, null);
  assert.equal(normalizeJobFile(file({ caption: 'Kept' })).caption, 'Kept');
});

test('missing-column detection matches PostgREST/Postgres errors for absent sharing columns', () => {
  assert.equal(isMissingSharingColumnError({ code: '42703', message: 'column job_files.client_visible does not exist' }), true);
  assert.equal(isMissingSharingColumnError({ code: 'PGRST204', message: "Could not find the 'client_visible' column of 'job_files' in the schema cache" }), true);
  assert.equal(isMissingSharingColumnError({ message: 'column job_files.caption does not exist' }), true);
  assert.equal(isMissingSharingColumnError({ code: '42501', message: 'permission denied for table job_files' }), false);
  assert.equal(isMissingSharingColumnError({ message: 'column job_files.bogus does not exist' }), false);
  assert.equal(isMissingSharingColumnError(null), false);
  assert.equal(isMissingSharingColumnError(undefined), false);
});
