type Store = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};
type Manifest = { revision: string; count: number };
function manifest(value: string | null): Manifest | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed.revision === 'string' && /^[a-z0-9-]+$/.test(parsed.revision)
      && Number.isInteger(parsed.count) && parsed.count > 0 && parsed.count < 1000 ? parsed : null;
  } catch { return null; }
}
// SecureStore entries remain under 2 KB even for Unicode session metadata.
// Publish the manifest only after every encrypted chunk has been written.
export function createChunkStorage(store: Store) {
  const entry = (key: string, m: Manifest, i: number) => `${key}.${m.revision}.${i}`;
  async function clean(key: string, m: Manifest | null) {
    if (m) await Promise.all(Array.from({ length: m.count }, (_, i) => store.deleteItemAsync(entry(key, m, i))));
  }
  return {
    async getItem(key: string) {
      const m = manifest(await store.getItemAsync(key));
      if (!m) return null;
      const chunks = await Promise.all(Array.from({ length: m.count }, (_, i) => store.getItemAsync(entry(key, m, i))));
      return chunks.some(chunk => chunk === null) ? null : chunks.join('');
    },
    async setItem(key: string, value: string) {
      const previous = manifest(await store.getItemAsync(key));
      const characters = Array.from(value);
      const chunks: string[] = [];
      for (let i = 0; i < characters.length; i += 400) chunks.push(characters.slice(i, i + 400).join(''));
      if (!chunks.length) chunks.push('');
      const next = { revision: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, count: chunks.length };
      try {
        for (let i = 0; i < chunks.length; i++) await store.setItemAsync(entry(key, next, i), chunks[i]);
        await store.setItemAsync(key, JSON.stringify(next));
      } catch (error) { await clean(key, next).catch(() => {}); throw error; }
      await clean(key, previous).catch(() => {});
    },
    async removeItem(key: string) {
      const previous = manifest(await store.getItemAsync(key));
      await store.deleteItemAsync(key);
      await clean(key, previous);
    },
  };
}
