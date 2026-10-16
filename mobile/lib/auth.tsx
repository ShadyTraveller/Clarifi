import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import { isRole, type Membership } from './model';

type AuthState = {
  db: SupabaseClient | null; session: Session | null; ready: boolean;
  memberships: Membership[]; member: Membership | null; error: string | null;
  selectWorkspace(id: string): void; reloadMemberships(): void;
};
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [db] = useState(() => { try { return getSupabase(); } catch { return null; } });
  const [configError] = useState(() => { try { getSupabase(); return null; } catch (error) { return error instanceof Error ? error.message : 'Workspace configuration is unavailable.'; } });
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(!db);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [membersReady, setMembersReady] = useState(false);
  const [error, setError] = useState<string | null>(configError);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!db) return;
    let alive = true, authEvent = false;
    const { data: listener } = db.auth.onAuthStateChange((_event, next) => {
      authEvent = true;
      if (alive) { setSession(next); setSessionReady(true); }
    });
    db.auth.getSession().then(({ data, error: failure }) => {
      if (!alive || authEvent) return;
      setSession(data.session); setSessionReady(true);
      if (failure) setError('Could not restore your session. Please sign in again.');
    }).catch(() => { if (alive) { setError('Could not restore your session.'); setSessionReady(true); } });
    const refresh = (state: string) => state === 'active' ? db.auth.startAutoRefresh() : db.auth.stopAutoRefresh();
    refresh(AppState.currentState);
    const appListener = AppState.addEventListener('change', refresh);
    return () => { alive = false; listener.subscription.unsubscribe(); appListener.remove(); db.auth.stopAutoRefresh(); };
  }, [db]);
  const userId = session?.user.id;
  useEffect(() => {
    setMemberships([]); setSelected(null); setMembersReady(false);
    if (!db || !userId) { setMembersReady(true); return; }
    let alive = true;
    const abort = new AbortController();
    setError(null);
    (async () => {
      const verified = await db.auth.getUser();
      if (verified.error || verified.data.user?.id !== userId) throw new Error('Your session has expired. Sign in again.');
      const response = await db.from('organization_members')
        .select('id,organization_id,user_id,role,display_name,organizations(name)')
        .eq('user_id', userId).eq('active', true).order('created_at').abortSignal(abort.signal);
      if (response.error) throw new Error('Could not load your workspace access. Try again or contact your administrator.');
      const list: Membership[] = (response.data ?? []).map(row => {
        if (!isRole(row.role)) throw new Error('Your account role is not supported. Contact your administrator.');
        const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
        return { ...row, role: row.role, organizationName: (org as { name?: string } | null)?.name ?? 'Workspace' };
      });
      if (alive) { setMemberships(list); if (list.length === 1) setSelected(list[0].id); }
    })().catch(failure => { if (alive) setError(failure instanceof Error ? failure.message : 'Could not load workspace access.'); })
      .finally(() => { if (alive) setMembersReady(true); });
    return () => { alive = false; abort.abort(); };
  }, [db, userId, reload]);
  // Never expose a previous user's cached membership during account transitions.
  const currentMemberships = memberships.filter(m => m.user_id === userId);
  const member = currentMemberships.find(m => m.id === selected) ?? null;
  return <AuthContext.Provider value={{ db, session, ready: sessionReady && (!session || membersReady),
    memberships: currentMemberships, member, error, selectWorkspace: setSelected,
    reloadMemberships: () => setReload(value => value + 1),
  }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is required.');
  return value;
}
