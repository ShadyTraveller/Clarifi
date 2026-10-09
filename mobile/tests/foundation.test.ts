import assert from 'node:assert/strict';
import { test } from 'node:test';
import { torontoDayBounds } from '../lib/day.ts';
import { validatePublicConfig } from '../lib/config.ts';
import { createChunkStorage } from '../lib/chunk-storage.ts';

test('Toronto appointments use the local day even when UTC is already tomorrow', () => {
  assert.deepEqual(torontoDayBounds(new Date('2026-10-09T01:00:00Z')), {
    start: '2026-10-08T04:00:00.000Z', end: '2026-10-09T04:00:00.000Z',
  });
});
test('Toronto day boundaries include the entire 23-hour spring day', () => {
  assert.deepEqual(torontoDayBounds(new Date('2026-03-08T17:00:00Z')), {
    start: '2026-03-08T05:00:00.000Z', end: '2026-03-09T04:00:00.000Z',
  });
});
test('Toronto day boundaries include the entire 25-hour fall day', () => {
  assert.deepEqual(torontoDayBounds(new Date('2026-11-01T17:00:00Z')), {
    start: '2026-11-01T04:00:00.000Z', end: '2026-11-02T05:00:00.000Z',
  });
});
test('day bounds handle month and year rollover', () => {
  assert.deepEqual(torontoDayBounds(new Date('2026-12-31T17:00:00Z')), {
    start: '2026-12-31T05:00:00.000Z', end: '2027-01-01T05:00:00.000Z',
  });
});
const url = 'https://example.supabase.co';
function jwt(role: string) { return `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`; }
test('public config accepts publishable and legacy anon keys', () => {
  assert.equal(validatePublicConfig(url, 'sb_publishable_fixture').url, url);
  assert.equal(validatePublicConfig(url, jwt('anon')).key, jwt('anon'));
});
test('public config rejects server keys, invalid URLs, and embedded credentials', () => {
  for (const key of ['sb_secret_fixture', jwt('service_role'), 'malformed']) {
    assert.throws(() => validatePublicConfig(url, key), /publishable/);
  }
  assert.throws(() => validatePublicConfig('http://example.supabase.co', 'sb_publishable_fixture'), /HTTPS/);
  assert.throws(() => validatePublicConfig('https://user:pass@example.supabase.co', 'sb_publishable_fixture'), /credentials/);
  assert.throws(() => validatePublicConfig(undefined, undefined), /not configured/);
});
function memoryStore() {
  const entries = new Map<string, string>();
  const store = {
    getItemAsync: async (key: string) => entries.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { entries.set(key, Buffer.from(value, 'utf8').toString('utf8')); },
    deleteItemAsync: async (key: string) => { entries.delete(key); },
  };
  return { entries, store, storage: createChunkStorage(store) };
}
test('large Unicode sessions round-trip through encrypted-entry-sized chunks', async () => {
  const { entries, storage } = memoryStore();
  const session = JSON.stringify({ refresh_token: 'abc'.repeat(3000), name: '👩🏽‍🔧'.repeat(500) });
  await storage.setItem('session', session);
  assert.equal(await storage.getItem('session'), session);
  for (const value of entries.values()) assert.ok(Buffer.byteLength(value, 'utf8') < 2048);
  await storage.removeItem('session');
  assert.equal(await storage.getItem('session'), null);
  assert.equal(entries.size, 0);
});
test('replacing a session removes previous encrypted chunks', async () => {
  const { entries, storage } = memoryStore();
  await storage.setItem('session', 'a'.repeat(8000));
  const old = [...entries.keys()].filter(key => key !== 'session');
  await storage.setItem('session', 'new-session');
  assert.equal(await storage.getItem('session'), 'new-session');
  assert.ok(old.every(key => !entries.has(key)));
});
test('a failed storage write preserves the previous session and cleans partial chunks', async () => {
  const { entries, store, storage } = memoryStore();
  await storage.setItem('session', 'previous');
  const keys = [...entries.keys()];
  const write = store.setItemAsync;
  let writes = 0;
  store.setItemAsync = async (key, value) => {
    if (++writes === 2) throw new Error('storage full');
    await write(key, value);
  };
  await assert.rejects(storage.setItem('session', 'b'.repeat(1000)), /storage full/);
  assert.equal(await storage.getItem('session'), 'previous');
  assert.deepEqual([...entries.keys()], keys);
});
test('an incomplete or corrupt stored session is never returned', async () => {
  const { entries, storage } = memoryStore();
  await storage.setItem('session', 'value');
  entries.delete([...entries.keys()].find(key => key !== 'session')!);
  assert.equal(await storage.getItem('session'), null);
  entries.set('session', '{broken');
  assert.equal(await storage.getItem('session'), null);
});
