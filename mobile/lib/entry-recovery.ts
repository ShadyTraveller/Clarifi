import { emptyEntry, relationships, type ClientMatch, type EntryDraft, type EntryPhoto } from './entry-model.ts';

export type EntryState = { draft: EntryDraft; client: ClientMatch | null; photos: EntryPhoto[]; attemptId: string | null; jobId: string | null; savedClientId: string | null };
export const freshEntry = (): EntryState => ({ draft: { ...emptyEntry }, client: null, photos: [], attemptId: null, jobId: null, savedClientId: null });
export type EntrySnapshot = { version: 1; scope: string; state: EntryState };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);

export function readSnapshot(value: unknown): EntrySnapshot {
  const snapshot = value as EntrySnapshot | null;
  const state = snapshot?.state, draft = state?.draft;
  if (snapshot?.version !== 1 || typeof snapshot.scope !== 'string' || !state || !draft || !isUUID(state.attemptId)
    || (state.jobId !== null && !isUUID(state.jobId)) || (state.savedClientId !== null && !isUUID(state.savedClientId))
    || Object.keys(emptyEntry).some(key => typeof draft[key as keyof EntryDraft] !== 'string')
    || !Object.hasOwn(relationships, draft.relationship) || !['doors', 'security_film', 'locksmith', 'skincare'].includes(draft.service)
    || !Array.isArray(state.photos) || state.photos.some(photo => !photo || !isUUID(photo.id) || typeof photo.uri !== 'string'
      || typeof photo.name !== 'string' || !/^[a-z0-9.-]+$/.test(photo.name) || typeof photo.mime !== 'string'
      || !photo.mime.startsWith('image/') || !Number.isFinite(photo.size) || photo.size <= 0 || typeof photo.saved !== 'boolean')) {
    throw new Error('Could not restore the saved request. Contact dispatch before starting it again.');
  }
  // Contact matches are only an autofill convenience; revalidate their shape.
  const client = state.client;
  if (client !== null && (!client || !isUUID(client.id) || typeof client.name !== 'string'
    || ['email', 'phone', 'address'].some(key => client[key as 'email' | 'phone' | 'address'] !== null && typeof client[key as 'email' | 'phone' | 'address'] !== 'string')
    || !Object.hasOwn(relationships, client.relationship) || String(client.relationship) === 'owner')) {
    throw new Error('Could not restore the saved contact. Contact dispatch before starting it again.');
  }
  return snapshot;
}

export function createRecoveryQueue() {
  let pending: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation, operation);
    pending = result.catch(() => {});
    return result;
  };
}
