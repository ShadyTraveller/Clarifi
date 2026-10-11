import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { emptyEntry, type ClientMatch, type EntryDraft, type EntryPhoto } from './entry-model';
import type { Dispatch, SetStateAction } from 'react';

export type EntryState = { draft: EntryDraft; client: ClientMatch | null; photos: EntryPhoto[]; attemptId: string | null; jobId: string | null };
const fresh = (): EntryState => ({ draft: { ...emptyEntry }, client: null, photos: [], attemptId: null, jobId: null });
const Context = createContext<{ state: EntryState; setState: Dispatch<SetStateAction<EntryState>>; reset(): void; controller: React.MutableRefObject<AbortController | null> } | null>(null);
export function EntryProvider({ children }: { children: ReactNode }) {
  const { member } = useAuth();
  const key = member?.id ?? '';
  const [saved, setSaved] = useState({ key, value: fresh() });
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { controller.current?.abort(); setSaved({ key, value: fresh() }); }, [key]);
  useEffect(() => () => { controller.current?.abort(); }, []);
  const state = saved.key === key ? saved.value : fresh();
  const setState: Dispatch<SetStateAction<EntryState>> = value => setSaved(previous => {
    if (previous.key !== key) return previous;
    return { key, value: typeof value === 'function' ? value(previous.value) : value };
  });
  return <Context.Provider value={{ state, setState, controller, reset: () => setSaved({ key, value: fresh() }) }}>{children}</Context.Provider>;
}
export function useEntry() {
  const value = useContext(Context);
  if (!value) throw new Error('EntryProvider is required.');
  return value;
}
