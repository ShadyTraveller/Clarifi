import type { SupabaseClient } from '@supabase/supabase-js';
import type { Membership } from './model';
import { leadPayload, normalizeEmail, phoneDigits, sameContact, validatePhoto, type ClientMatch, type EntryDraft, type EntryPhoto } from './entry-model';

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
export async function createLead(db: SupabaseClient, member: Membership, draft: EntryDraft, client: ClientMatch | null, jobId: string, signal: AbortSignal) {
  // No client INSERT fallback: only Muse can provide atomic normalized dedupe.
  if (!client) throw new Error('New clients are temporarily unavailable. Choose an existing client or contact dispatch.');
  if (draft.service === 'security_film') throw new Error('Security film request entry is awaiting setup. Contact dispatch.');
  await verifyEntryAccess(db, member, signal);
  const contact = await db.from('clients').select('id').eq('organization_id', member.organization_id).eq('id', client.id).abortSignal(signal).maybeSingle();
  if (contact.error || !contact.data) throw new Error('This client is no longer available. Check the client again.');
  // A stable primary key reconciles uncertain responses and repeated taps.
  const prior = await db.from('jobs').select('id,client_id').eq('organization_id', member.organization_id).eq('id', jobId).abortSignal(signal).maybeSingle();
  if (prior.error) throw new Error('Could not confirm whether this request was saved. Retry to check it safely.');
  if (prior.data) {
    if (prior.data.client_id !== client.id) throw new Error('Could not verify this request. Contact dispatch.');
    return prior.data.id as string;
  }
  const response = await db.from('jobs').insert({ id: jobId, ...leadPayload(draft, member.organization_id, client.id) }).select('id').abortSignal(signal).single();
  if (response.error || !response.data) throw new Error('Could not confirm the save. Retry checks the same request, without creating another.');
  return response.data.id as string;
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
