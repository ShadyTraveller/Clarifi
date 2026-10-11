import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { useAuth } from './auth';
import { freshEntry, type EntryState } from './entry-recovery';
import { entryStorage, recoveryQueue } from './entry-storage';

const Context = createContext<{
  state: EntryState; setState: Dispatch<SetStateAction<EntryState>>;
  ready: boolean; error: string | null; reload(): void; reset(): Promise<void>;
  checkpoint(state: EntryState, signal: AbortSignal): Promise<EntryState>;
  controller: React.MutableRefObject<AbortController | null>;
} | null>(null);
export function EntryProvider({ children }: { children: ReactNode }) {
  const { member, ready: authReady } = useAuth();
  const memberScope = member ? `${member.user_id}:${member.organization_id}:${member.id}` : '';
  const key = member?.role !== 'technician' ? memberScope : '';
  const activeKey = useRef(key); activeKey.current = key;
  const [saved, setSaved] = useState({ key: '', value: freshEntry(), ready: false, error: null as string | null });
  const [reload, setReload] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!authReady) return;
    let alive = true;
    controller.current?.abort();
    setSaved({ key, value: freshEntry(), ready: false, error: null });
    void recoveryQueue(async () => {
      if (member?.role === 'technician' && memberScope) await entryStorage.clear(memberScope);
      // Initial signed-out state must not erase recovery from an app restart.
      if (!key) return freshEntry();
      const snapshot = await entryStorage.read(key);
      if (snapshot && snapshot.scope !== key) throw new Error('Saved workspace does not match.');
      return snapshot?.state ?? freshEntry();
    }).then(value => { if (alive) setSaved({ key, value, ready: true, error: null }); })
      .catch(() => { if (alive) setSaved({ key, value: freshEntry(), ready: false, error: 'Could not restore your saved request. Try again before starting another request.' }); });
    return () => { alive = false; controller.current?.abort(); };
  }, [key, memberScope, authReady, member?.role, reload]);
  useEffect(() => () => { controller.current?.abort(); }, []);
  const setState: Dispatch<SetStateAction<EntryState>> = value => setSaved(previous => {
    if (previous.key !== key || activeKey.current !== key || !previous.ready) return previous;
    return { ...previous, value: typeof value === 'function' ? value(previous.value) : value };
  });
  async function checkpoint(value: EntryState, signal: AbortSignal) {
    const result = await recoveryQueue(async () => {
      signal.throwIfAborted();
      if (!key || activeKey.current !== key) throw new Error('Workspace changed.');
      try { return await entryStorage.write({ version: 1, scope: key, state: value }); }
      catch { throw new Error('Could not keep this save for recovery. Free device storage and retry; the request reference is unchanged.'); }
    });
    signal.throwIfAborted();
    if (activeKey.current !== key) throw new Error('Workspace changed.');
    setState(result.state); return result.state;
  }
  async function reset() {
    controller.current?.abort();
    await recoveryQueue(async () => {
      if (activeKey.current !== key) throw new Error('Workspace changed.');
      await entryStorage.clear(key);
    });
    setState(freshEntry());
  }
  const current = saved.key === key ? saved : { value: freshEntry(), ready: false, error: null };
  return <Context.Provider value={{ state: current.value, setState, checkpoint, reset, controller,
    ready: current.ready, error: current.error, reload: () => setReload(value => value + 1) }}>{children}</Context.Provider>;
}
export function useEntry() {
  const value = useContext(Context);
  if (!value) throw new Error('EntryProvider is required.');
  return value;
}
