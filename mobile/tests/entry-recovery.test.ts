import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRecoveryQueue, freshEntry, readSnapshot, type EntrySnapshot } from '../lib/entry-recovery.ts';

test('recovery retains an uncertain request key, contact, and attachment identities across serialization', () => {
  const state = freshEntry(); state.attemptId = '00000000-0000-4000-8000-000000000001';
  state.draft = { ...state.draft, name: 'Test client', request: 'Test request', gate: 'Private gate' };
  state.photos = [{ id: '00000000-0000-4000-8000-000000000002', uri: 'file:///private/photo.png', name: 'photo.png', size: 12, mime: 'image/png', saved: false }];
  const snapshot: EntrySnapshot = { version: 1, scope: 'user:org:member', state };
  assert.deepEqual(readSnapshot(JSON.parse(JSON.stringify(snapshot))), snapshot);
  assert.throws(() => readSnapshot({ ...snapshot, state: { ...state, attemptId: null } }), /restore/);
  assert.throws(() => readSnapshot({ ...snapshot, state: { ...state, photos: [{ ...state.photos[0], name: '../photo.png' }] } }), /restore/);
});

test('scope cleanup waits for prior writes; a storage failure does not poison subsequent recovery', async () => {
  const enqueue = createRecoveryQueue();
  let release!: () => void, stored = '';
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const first = enqueue(async () => { await barrier; stored = 'old workspace'; });
  const cleanup = enqueue(async () => { stored = ''; });
  release(); await Promise.all([first, cleanup]); assert.equal(stored, '');
  await assert.rejects(enqueue(async () => { throw new Error('Disk full'); }));
  await enqueue(async () => { stored = 'same request key on retry'; });
  assert.equal(stored, 'same request key on retry');
});
