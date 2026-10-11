import type { SupabaseClient } from '@supabase/supabase-js';
import type { Membership } from './model';
import { requestPayload, normalizeEmail, phoneDigits, sameContact, validatePhoto, type ClientMatch, type EntryDraft, type EntryPhoto } from './entry-model.ts';

const clientColumns = 'id,name,email,phone,address,relationship';
// The contract's digits-only substring does not match formatted stored numbers.
// Search digit subsequences, then compare complete normalized numbers locally.
export async function findClients(db: SupabaseClient, member: Membership, draft: EntryDraft, signal: AbortSignal) {
  const email = normalizeEmail(draft.email), digits = phoneDigits(draft.phone);
  if (!email && !digits) return [];
  async function search(field: 'email' | 'phone', pattern: string) {
    const rows: ClientMatch[] = [];
    for (let offset = 0; ; offset += 200) {
      const response = await db.from('clients').select(clientColumns).eq('organization_id', member.organization_id)
        .ilike(field, pattern).order('created_at', { ascending: false }).order('id').range(offset, offset + 199).abortSignal(signal);
      if (response.error) throw new Error('Could not check existing clients. Try again.');
      rows.push(...(response.data ?? []) as ClientMatch[]);
      if ((response.data?.length ?? 0) < 200) break;
    }
    return rows;
  }
  const results = await Promise.all([
    email ? search('email', `%${email.replace(/[\\%_]/g, '\\$&')}%`) : [],
    digits ? search('phone', `%${digits.split('').join('%')}%`) : [],
  ]);
  return [...new Map(results.flat().filter(client => sameContact(client, draft)).map(client => [client.id, client])).values()];
}
export async function verifyEntryAccess(db: SupabaseClient, member: Membership, signal: AbortSignal) {
  signal.throwIfAborted();
  const user = await db.auth.getUser();
  if (user.error || user.data.user?.id !== member.user_id) throw new Error('Sign in again before saving this request.');
  const response = await db.from('organization_members').select('id,role').eq('id', member.id).eq('user_id', member.user_id)
    .eq('organization_id', member.organization_id).eq('active', true).abortSignal(signal).maybeSingle();
  if (response.error || !response.data || !['owner', 'admin', 'dispatcher', 'office'].includes(response.data.role)) throw new Error('Your workspace access changed. Contact dispatch.');
  signal.throwIfAborted();
}
export async function createLead(db: SupabaseClient, member: Membership, draft: EntryDraft, sourceRef: string, signal: AbortSignal) {
  await verifyEntryAccess(db, member, signal);
  // Always use the four-argument overload. Never retry through the old wrapper
  // or raw table inserts: both would bypass source-ref replay guarantees.
  const response = await db.rpc('create_clarifi_request', requestPayload(draft, member.organization_id, sourceRef)).abortSignal(signal);
  if (response.error) {
    if (response.error.code === 'PGRST202') throw new Error('Request saving is awaiting a server update. Your entry is kept. Retry after dispatch confirms it is ready.');
    if (response.error.code === '42501') throw new Error('You no longer have permission to create requests in this workspace. Contact dispatch.');
    throw new Error('Could not confirm the save. Retry uses the same request reference, without creating another.');
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof response.data !== 'string' || !uuid.test(response.data)) throw new Error('Could not confirm the saved request. Retry to check it safely.');
  // The returned job UUID is not the source reference. Resolve the actual client
  // selected by server-side dedupe before associating any photo metadata.
  const job = await db.from('jobs').select('id,client_id').eq('organization_id', member.organization_id)
    .eq('id', response.data).abortSignal(signal).single();
  if (job.error || !job.data || !uuid.test(job.data.client_id)) throw new Error('The save needs confirmation. Retry to retrieve the same request and its client.');
  return { jobId: job.data.id as string, clientId: job.data.client_id as string };
}
export async function uploadEntryPhoto(db: SupabaseClient, member: Membership, jobId: string, clientId: string, photo: EntryPhoto, bytes: ArrayBuffer, signal: AbortSignal) {
  const failure = validatePhoto(bytes.byteLength, photo.mime);
  if (failure) throw new Error(failure);
  await verifyEntryAccess(db, member, signal);
  const path = `${jobId}/${photo.id}-${photo.name}`;
  const existing = await db.from('job_files').select('id,storage_path').eq('organization_id', member.organization_id).eq('job_id', jobId).eq('id', photo.id).abortSignal(signal).maybeSingle();
  if (existing.error) throw new Error('Could not check this photo. Retry when connected.');
  if (existing.data) {
    if (existing.data.storage_path !== path) throw new Error('Could not verify this photo. Contact dispatch.');
    return;
  }
  const stored = await db.storage.from('job-files').list(jobId, { search: `${photo.id}-${photo.name}`, limit: 100 });
  if (stored.error) throw new Error('Could not check photo storage. Retry when connected.');
  signal.throwIfAborted();
  if (!stored.data?.some(file => file.name === `${photo.id}-${photo.name}`)) {
    const uploaded = await db.storage.from('job-files').upload(path, bytes, { contentType: photo.mime, upsert: false });
    if (uploaded.error) throw new Error('Could not upload this photo. The request is saved; retry the photo.');
  }
  await verifyEntryAccess(db, member, signal);
  const response = await db.from('job_files').insert({ id: photo.id, organization_id: member.organization_id, job_id: jobId, client_id: clientId, storage_path: path, file_name: photo.name, mime_type: photo.mime }).abortSignal(signal);
  if (response.error) throw new Error('Could not confirm the photo attachment. Retry to check it safely.');
}
