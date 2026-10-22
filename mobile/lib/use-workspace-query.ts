import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

export function useWorkspaceQuery<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ key: string; data: T | null; busy: boolean; error: string | null }>({ key, data: null, busy: true, error: null });
  const pending = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setState(previous => ({ key, data: previous.key === key ? previous.data : null, busy: true, error: null }));
    try {
      const data = await load(controller.signal);
      if (!controller.signal.aborted) setState({ key, data, busy: false, error: null });
    } catch {
      if (!controller.signal.aborted) setState(previous => ({ ...previous, busy: false, error: 'Could not load work. Check your connection and try again.' }));
    }
  }, [key, load]);
  useFocusEffect(useCallback(() => {
    void refresh();
    const listener = AppState.addEventListener('change', status => {
      if (status === 'active') void refresh(); else pending.current?.abort();
    });
    return () => { listener.remove(); pending.current?.abort(); };
  }, [refresh]));
  // A filter/workspace change hides the previous response before the next effect runs.
  return { ...(state.key === key ? state : { data: null, busy: true, error: null }), refresh };
}
