import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createLead } from '../lib/entry-api.ts';
import { emptyEntry, requestPayload } from '../lib/entry-model.ts';
import type { Membership } from '../lib/model';

const sourceRef = '00000000-0000-4000-8000-000000000001';
const jobId = '00000000-0000-4000-8000-000000000002';
const clientId = '00000000-0000-4000-8000-000000000003';
const member = { id: 'member', user_id: 'user', organization_id: 'org', role: 'dispatcher' } as Membership;
const draft = { ...emptyEntry, name: 'Test client', email: ' TEST@EXAMPLE.INVALID ', relationship: 'owner' as const, request: 'Film request', unit: '4B', service: 'security_film' as const };

test('RPC retries reuse source reference; attachment IDs come from the returned job, not the request key', async () => {
  const calls: object[] = [];
  let first = true;
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: member.user_id } }, error: null }) },
    from(table: string) {
      assert.ok(['organization_members', 'jobs'].includes(table), 'No raw inserts or client mutation fallback');
      const filters = new Map<string, unknown>();
      const query = { select() { return query; }, eq(k: string, v: unknown) { filters.set(k, v); return query; }, abortSignal() { return query; },
        async maybeSingle() { return { data: { id: member.id, role: 'dispatcher' }, error: null }; },
        async single() {
          assert.equal(filters.get('organization_id'), 'org'); assert.equal(filters.get('id'), jobId);
          return { data: { id: jobId, client_id: clientId }, error: null };
        } };
      return query;
    },
    rpc(name: string, args: object) {
      assert.equal(name, 'create_clarifi_request'); calls.push(args);
      return { async abortSignal() {
        if (first) { first = false; return { data: null, error: { code: 'NETWORK' } }; }
        return { data: jobId, error: null };
      } };
    },
  } as unknown as SupabaseClient;
  await assert.rejects(createLead(db, member, draft, sourceRef, new AbortController().signal), /same request reference/);
  assert.deepEqual(await createLead(db, member, draft, sourceRef, new AbortController().signal), { jobId, clientId });
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[0], { target_org: 'org', p_source_ref: sourceRef,
    client_info: { name: 'Test client', role: 'other', email: 'test@example.invalid', phone: null, address: null },
    job_info: { title: 'Film request', details: 'Unit 4B', service: 'security_film', markdown: null, technician_id: null, latitude: null, longitude: null } });
});

test('missing v2 RPC reports deployment dependency and never calls the legacy overload', async () => {
  let rpcCalls = 0;
  const query = { select() { return query; }, eq() { return query; }, abortSignal() { return query; }, maybeSingle: async () => ({ data: { role: 'dispatcher' } }) };
  const db = { auth: { getUser: async () => ({ data: { user: { id: member.user_id } } }) }, from: () => query,
    rpc(_name: string, payload: ReturnType<typeof requestPayload>) {
      rpcCalls++; assert.equal(payload.p_source_ref, sourceRef);
      return { abortSignal: async () => ({ error: { code: 'PGRST202' } }) };
    } } as unknown as SupabaseClient;
  await assert.rejects(createLead(db, member, draft, sourceRef, new AbortController().signal), /awaiting a server update/);
  assert.equal(rpcCalls, 1);
});
