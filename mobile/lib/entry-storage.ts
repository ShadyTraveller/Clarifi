import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Directory, File, Paths } from 'expo-file-system';
import { createChunkStorage } from './chunk-storage';
import { createRecoveryQueue, readSnapshot, type EntrySnapshot } from './entry-recovery';
import { validatePhoto } from './entry-model';

const encrypted = createChunkStorage(SecureStore);
const storageKey = 'yavamo.entry.v1';
export const recoveryQueue = createRecoveryQueue();
const scopeKey = (scope: string) => `${storageKey}.${scope.replace(/:/g, '.')}`;
const recoveryDirectory = (scope: string) => new Directory(Paths.document, 'pending-request', scope.replace(/:/g, '.'));
let browserDB: Promise<IDBDatabase> | undefined;
const restoredURLs = new Set<string>();
function browserStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  browserDB ??= new Promise((resolve, reject) => {
    const open = indexedDB.open('yavamo-entry-recovery', 1);
    open.onupgradeneeded = () => { open.result.createObjectStore('drafts'); };
    open.onsuccess = () => { resolve(open.result); };
    open.onerror = () => { browserDB = undefined; reject(new Error('Recovery storage is unavailable.')); };
  });
  return browserDB.then(db => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction('drafts', mode);
    const request = action(transaction.objectStore('drafts'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = transaction.onabort = () => reject(new Error('Recovery storage could not be updated.'));
  }));
}
function revokeRestoredPhotos() { restoredURLs.forEach(uri => URL.revokeObjectURL(uri)); restoredURLs.clear(); }

// Call through recoveryQueue so reads, writes, and explicit cleanup complete in order.
export const entryStorage = {
  async read(scope: string): Promise<EntrySnapshot | null> {
    if (Platform.OS !== 'web') {
      const manifest = await SecureStore.getItemAsync(scopeKey(scope));
      const stored = await encrypted.getItem(scopeKey(scope));
      if (manifest !== null && stored === null) throw new Error('Saved request recovery is incomplete.');
      return stored ? readSnapshot(JSON.parse(stored)) : null;
    }
    const record = await browserStore<{ snapshot: unknown; blobs: Record<string, Blob> } | undefined>('readonly', store => store.get(scope));
    if (!record) return null;
    const snapshot = readSnapshot(record.snapshot);
    revokeRestoredPhotos();
    const photos = snapshot.state.photos.map(photo => {
      const blob = record.blobs?.[photo.id];
      if (!(blob instanceof Blob)) throw new Error('A saved photo could not be restored. Contact dispatch before restarting the request.');
      const uri = URL.createObjectURL(blob); restoredURLs.add(uri);
      return { ...photo, uri };
    });
    return { ...snapshot, state: { ...snapshot.state, photos } };
  },
  async write(snapshot: EntrySnapshot): Promise<EntrySnapshot> {
    readSnapshot(snapshot);
    if (Platform.OS === 'web') {
      const entries = await Promise.all(snapshot.state.photos.map(async photo => {
        if (!/^(blob:|data:image\/)/.test(photo.uri)) throw new Error('The selected photo is unavailable.');
        const response = await fetch(photo.uri), blob = await response.blob();
        const failure = validatePhoto(blob.size, photo.mime); if (failure) throw new Error(failure);
        return [photo.id, blob] as const;
      }));
      await browserStore('readwrite', store => store.put({ snapshot, blobs: Object.fromEntries(entries) }, snapshot.scope));
      return snapshot;
    }
    const folder = recoveryDirectory(snapshot.scope); folder.create({ intermediates: true, idempotent: true });
    const photos = snapshot.state.photos.map(photo => {
      const source = new File(photo.uri), backup = new File(folder, `${photo.id}-${photo.name}`);
      if (source.uri !== backup.uri && (!backup.exists || backup.size !== source.size)) {
        if (backup.exists) backup.delete();
        source.copy(backup);
      }
      const failure = validatePhoto(backup.size, photo.mime); if (failure) throw new Error(failure);
      return { ...photo, uri: backup.uri, size: backup.size };
    });
    const stored = { ...snapshot, state: { ...snapshot.state, photos } };
    const json = JSON.stringify(stored);
    if (Array.from(json).length > 300000) throw new Error('This request is too large to keep safely on the device.');
    await encrypted.setItem(scopeKey(snapshot.scope), json);
    return stored;
  },
  async clear(scope: string) {
    if (Platform.OS === 'web') {
      await browserStore('readwrite', store => store.delete(scope)); revokeRestoredPhotos();
    } else {
      await encrypted.removeItem(scopeKey(scope));
      const folder = recoveryDirectory(scope); if (folder.exists) folder.delete();
    }
  },
};
