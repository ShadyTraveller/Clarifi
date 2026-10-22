import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Icon } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useEntry } from '../lib/entry-context';
import { colors, fonts } from '../lib/theme';

export default function Account() {
  const { db, member, session, memberships, selectWorkspace } = useAuth();
  const entry = useEntry();
  const unfinished = !!entry.state.attemptId && (!entry.state.jobId || entry.state.photos.some(photo => !photo.saved));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function signOut() {
    if (!db || busy) return;
    setBusy(true); setError('');
    try {
      // Keep uncertain saves scoped to this user/workspace for a safe retry
      // after reauthentication. Completed entries can be removed on sign-out.
      if (entry.ready && !unfinished) await entry.reset();
      const result = await db.auth.signOut({ scope: 'local' });
      if (result.error) throw result.error;
      // Expo Router's protected route returns to the dashboard/sign-in screen.
    } catch { setError('Could not sign out. Please try again.'); }
    finally { setBusy(false); }
  }
  return <ScrollView contentContainerStyle={s.page}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to dashboard" onPress={() => router.dismissTo('/')} style={s.back}><Icon name="arrow-left" /><Text style={s.backText}>Dashboard</Text></Pressable>
    <Text style={s.title}>Your workspace</Text><Text style={s.subtitle}>Connected to your team.</Text>
    <Card><View style={s.identity}><View style={s.avatar}><Icon name="user" /></View><View style={{ flex: 1 }}><Text style={s.name}>{member?.display_name ?? 'Team member'}</Text><Text style={s.email}>{session?.user.email}</Text></View></View>
      <View style={s.row}><Text style={s.label}>Workspace</Text><Text style={s.value}>{member?.organizationName}</Text></View>
      <View style={s.row}><Text style={s.label}>Role</Text><Text style={s.value}>{member?.role === 'technician' ? 'Technician' : member?.role === 'dispatcher' ? 'Dispatcher' : member?.role === 'office' ? 'Office' : member?.role === 'admin' ? 'Admin' : 'Owner'}</Text></View>
    </Card>
    {memberships.length > 1 && <Card><Text style={s.section}>Switch workspace</Text>{memberships.map(workspace => <View key={workspace.id} style={{ marginTop: 12 }}><Button label={workspace.organizationName} secondary disabled={workspace.id === member?.id} onPress={() => { selectWorkspace(workspace.id); router.dismissTo('/'); }} /></View>)}</Card>}
    <Text style={s.help}>Your administrator manages roles and team access.</Text>
    {unfinished && <Text style={s.help}>An unfinished request is saved on this device. Sign back into this workspace to finish it.</Text>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    <Button label="Sign out of this device" icon="log-out" secondary busy={busy} onPress={signOut} />
  </ScrollView>;
}
const s = StyleSheet.create({
  page: { padding: 24, gap: 20, maxWidth: 640, width: '100%', alignSelf: 'center' }, back: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }, backText: { fontFamily: fonts.medium, color: colors.ink, fontSize: 14 }, title: { fontFamily: fonts.bold, color: colors.ink, fontSize: 32, letterSpacing: -1 }, subtitle: { fontFamily: fonts.regular, color: colors.muted, fontSize: 14, marginTop: -12 }, identity: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 20 }, avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' }, name: { fontFamily: fonts.semibold, color: colors.ink, fontSize: 18 }, email: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: 5 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, borderTopWidth: 1, borderColor: colors.line, paddingTop: 16, marginTop: 12 }, label: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted }, value: { flex: 1, textAlign: 'right', fontFamily: fonts.medium, fontSize: 13, color: colors.ink }, section: { fontFamily: fonts.semibold, color: colors.ink, fontSize: 16 }, help: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 21, color: colors.muted }, error: { fontFamily: fonts.regular, color: colors.red, fontSize: 14 },
});
