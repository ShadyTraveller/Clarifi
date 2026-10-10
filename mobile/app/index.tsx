import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AccessGate } from '../components/AccessGate';
import { Card, Icon, Button } from '../components/ui';
import { StateMessage } from '../components/ui';
import { useAuth } from '../lib/auth';
import { fetchDashboard } from '../lib/dashboard';
import { dayLabel, timeLabel } from '../lib/day';
import { colors, fonts } from '../lib/theme';
import { type DashboardData, type Membership } from '../lib/model';
import { JobList } from '../components/WorkUI';

export default function Home() {
  const { member } = useAuth();
  return <AccessGate>{member ? <Dashboard key={member.id} member={member} /> : null}</AccessGate>;
}
function Dashboard({ member }: { member: Membership }) {
  const { db } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const tech = member.role === 'technician';
  const refresh = useCallback(async () => {
    if (!db) return;
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setBusy(true);
    try {
      const next = await fetchDashboard(db, member, controller.signal);
      if (!controller.signal.aborted) { setData(next); setError(null); }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not refresh the workspace.');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }, [db, member]);
  useFocusEffect(useCallback(() => {
    void refresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 60_000);
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh(); else pending.current?.abort();
    });
    return () => { clearInterval(timer); listener.remove(); pending.current?.abort(); };
  }, [refresh]));
  const count = data?.jobs.length ?? 0;
  const done = data?.jobs.filter(job => job.status === 'completed').length ?? 0;
  return <View testID="home-screen" style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={busy && !!data} onRefresh={() => { void refresh(); }} tintColor={colors.ink} />}>
      <View style={s.heading}>
        <Text style={s.eyebrow}>{tech ? 'FIELD TEAM' : 'DISPATCH DASHBOARD'}</Text>
        <Text style={s.title}>{tech ? 'Your day, sorted.' : 'Keep the day moving.'}</Text>
        <Text style={s.date}>{dayLabel()} · Toronto time</Text>
        <View style={s.actions}><Button label="View schedule" icon="calendar" onPress={() => router.dismissTo('/schedule')} /><Button label="Browse work" secondary icon="briefcase" onPress={() => router.dismissTo('/work')} /></View>
      </View>
      <View accessibilityLiveRegion="polite" style={s.signal}>
        <View style={[s.dot, { backgroundColor: error ? colors.red : data ? colors.green : colors.muted }]} />
        <Text style={s.signalText}>{busy ? 'Refreshing workspace…' : error ? 'Refresh needed' : data ? `Updated ${timeLabel(data.checkedAt)}` : 'Connecting to workspace…'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh dashboard" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => { void refresh(); }} style={s.refresh}><Icon name="refresh-cw" size={16} color={colors.muted} /></Pressable>
      </View>
      {!!error && <Card style={{ backgroundColor: colors.redWash, borderColor: '#F1D2CD' }}>
        <Text accessibilityRole="alert" style={s.error}>{error}</Text>
        {!!data && <Text style={s.errorDetail}>Showing the last successful update. Counts may have changed.</Text>}
        <Button label="Try again" secondary onPress={() => { void refresh(); }} disabled={busy} />
      </Card>}
      {busy && !data ? <Card><ActivityIndicator color={colors.ink} /><Text style={s.loading}>Loading today’s work…</Text></Card> : data ? <>
        {!tech && <View style={s.metrics}>
          <Metric value={data.unassigned ?? 0} label="Unassigned requests" icon="inbox" />
          <Metric value={data.alerts ?? 0} label="Unread alerts" icon="bell" />
        </View>}
        <View style={s.scheduleHeading}><Text style={s.sectionTitle}>{tech ? 'Your appointments' : 'Today’s appointments'}</Text><Text style={s.scheduleCount}>{count}</Text></View>
        <Text style={s.sectionDetail}>{tech ? 'Assigned to you. Ready when you are.' : 'A clear view of your team’s day.'}</Text>
        {!count ? <Card><StateMessage title="A little room in the day" detail={tech ? 'No appointments are assigned to you today. New assignments will appear here after dispatch schedules them.' : 'No appointments scheduled today. Scheduled jobs will appear here as your team plans the day.'} icon="calendar" /></Card>
          : <JobList jobs={data.jobs} />}
        {!!count && <View style={s.progress}><Icon name="check-circle" color={colors.green} size={17} /><Text style={s.progressText}>{done} of {count} appointments completed</Text></View>}
        <View style={s.note}><Icon name="info" color={colors.muted} size={16} /><Text style={s.noteText}>Scheduling and assignments are managed manually by dispatch.</Text></View>
      </> : !busy && !error ? <Card><StateMessage title="Workspace unavailable" detail="Pull down to try again." /></Card> : null}
    </ScrollView>
  </View>;
}
function Metric({ value, label, icon }: { value: number; label: string; icon: 'inbox' | 'bell' }) {
  return <Card style={s.metric}><View style={s.metricTop}><Icon name={icon} size={18} color={colors.muted} /><Text style={s.metricValue}>{value}</Text></View><Text style={s.metricLabel}>{label}</Text></Card>;
}
const s = StyleSheet.create({
  page: { padding: 22, paddingBottom: 32, gap: 16, maxWidth: 1120, width: '100%', alignSelf: 'center' }, heading: { gap: 10, marginTop: 10 }, eyebrow: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1.5 }, title: { color: colors.ink, fontFamily: fonts.bold, fontSize: 32, letterSpacing: -1.3, lineHeight: 39 }, date: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13 }, signal: { flexDirection: 'row', alignItems: 'center', gap: 8 }, dot: { width: 6, height: 6, borderRadius: 3 }, signalText: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, flex: 1 }, refresh: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  metrics: { flexDirection: 'row', gap: 12 }, metric: { flex: 1, padding: 16, gap: 14 }, metricTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, metricValue: { fontFamily: fonts.bold, fontSize: 30, color: colors.ink, letterSpacing: -1 }, metricLabel: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12, lineHeight: 19 }, scheduleHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }, sectionTitle: { fontFamily: fonts.semibold, color: colors.ink, fontSize: 18, flexShrink: 1 }, scheduleCount: { backgroundColor: '#ECECE5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, fontFamily: fonts.semibold, fontSize: 12, color: colors.ink }, sectionDetail: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, marginTop: -8 }, jobs: { gap: 12 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 8 }, progressText: { fontFamily: fonts.medium, fontSize: 12, color: colors.green }, note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 8 }, noteText: { flex: 1, fontFamily: fonts.regular, fontSize: 12, lineHeight: 19, color: colors.muted }, loading: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, textAlign: 'center', marginTop: 14 }, error: { color: colors.red, fontFamily: fonts.medium, fontSize: 14, lineHeight: 21, marginBottom: 12 }, errorDetail: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.red, marginBottom: 12 },

});
