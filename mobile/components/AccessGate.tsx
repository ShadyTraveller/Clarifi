import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { colors, fonts } from '../lib/theme';
import { Button, Card, StateMessage } from './ui';
import { SignIn } from './SignIn';
import type { ReactNode } from 'react';
import { useState } from 'react';

export function AccessGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [signOutError, setSignOutError] = useState('');
  const [signOutBusy, setSignOutBusy] = useState(false);
  async function signOut() {
    if (!auth.db || signOutBusy) return;
    setSignOutError(''); setSignOutBusy(true);
    try {
      const result = await auth.db.auth.signOut({ scope: 'local' });
      if (result.error) throw result.error;
    } catch { setSignOutError('Could not sign out. Please try again.'); }
    finally { setSignOutBusy(false); }
  }
  if (!auth.ready) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 }}><ActivityIndicator color={colors.ink} /><Text style={{ fontFamily: fonts.regular, color: colors.muted }}>Opening your workspace…</Text></View>;
  if (!auth.db) return <View style={{ padding: 24 }}><StateMessage title="Connect your workspace" detail={auth.error ?? 'Workspace configuration is unavailable.'} icon="settings" /></View>;
  if (!auth.session) return <SignIn />;
  if (!auth.member) return <ScrollView contentContainerStyle={{ padding: 24, gap: 16, flexGrow: 1, justifyContent: 'center' }}>
    <StateMessage title={auth.error ? 'Workspace unavailable' : auth.memberships.length ? 'Choose your workspace' : 'Workspace access needed'}
      detail={auth.error ?? (auth.memberships.length ? 'Select the team you are working with today.' : 'Ask your administrator to add an active staff membership for this account.')} icon={auth.error ? 'wifi-off' : 'users'} error={!!auth.error} />
    {auth.memberships.map(member => <Card key={member.id}><Text style={{ fontFamily: fonts.semibold, fontSize: 18, color: colors.ink, marginBottom: 12 }}>{member.organizationName}</Text><Button label={`Open ${member.organizationName}`} onPress={() => auth.selectWorkspace(member.id)} /></Card>)}
    {!!auth.error && <Button label="Try again" onPress={auth.reloadMemberships} secondary />}
    {!!signOutError && <Text accessibilityRole="alert" style={{ color: colors.red, fontFamily: fonts.regular }}>{signOutError}</Text>}
    <Button label="Sign out" onPress={signOut} busy={signOutBusy} secondary />
  </ScrollView>;
  return children;
}
