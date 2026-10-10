import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { fetchWork } from '../../lib/jobs';
import { useWorkspaceQuery } from '../../lib/use-workspace-query';
import { services, statusLabels } from '../../lib/model';
import { dayLabel, timeLabel } from '../../lib/day';
import { colors, fonts } from '../../lib/theme';
import { Card, Icon, StateMessage } from '../../components/ui';
import { PageHeading, QueryState, pageStyles } from '../../components/WorkUI';

export default function JobDetail() {
  const { member } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  return member ? <Detail key={`${member.id}:${id}`} id={id} /> : null;
}
function Detail({ id }: { id: string }) {
  const { db, member } = useAuth();
  const load = useCallback((signal: AbortSignal) => fetchWork(db!, member!, signal, { id }), [db, member, id]);
  const { data, busy, error, refresh } = useWorkspaceQuery(`${member!.id}:${id}`, load);
  const job = data?.jobs[0];
  return <ScrollView testID="job-screen" contentContainerStyle={pageStyles.page} refreshControl={<RefreshControl refreshing={busy && !!data} onRefresh={() => { void refresh(); }} />}>
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace('/work')} style={s.back}><Icon name="arrow-left" /><Text style={s.backText}>Back</Text></Pressable>
    <QueryState busy={busy} error={error} hasData={!!data} retry={() => { void refresh(); }} />
    {data && !job && <Card><StateMessage title="Job unavailable" detail="This job may have changed, or it isn’t available in your workspace. Return to Work to see your current jobs." icon="briefcase" /></Card>}
    {job && <>
      <PageHeading eyebrow="JOB DETAILS" title={job.clientName} detail={services[job.service]} />
      <View style={s.status}><View style={s.dot} /><Text style={s.statusText}>{statusLabels[job.status]}</Text></View>
      <Card style={s.card}><Text accessibilityRole="header" style={pageStyles.section}>The request</Text><Text selectable style={s.request}>{job.request}</Text></Card>
      <Card style={s.card}><Text accessibilityRole="header" style={pageStyles.section}>Appointment</Text><View style={s.line}><Icon name="calendar" color={colors.muted} /><Text style={s.value}>{job.scheduled_start ? dayLabel(new Date(job.scheduled_start)) : 'Not scheduled'}</Text></View>
        {job.scheduled_start && <View style={s.line}><Icon name="clock" color={colors.muted} /><Text style={s.value}>{timeLabel(job.scheduled_start)}{job.scheduled_end ? ` – ${timeLabel(job.scheduled_end)}` : ''} · Toronto time</Text></View>}
        <Text style={pageStyles.subtle}>{job.assigned_to || job.technician_id ? 'Assigned to the team' : 'Awaiting assignment'}</Text>
      </Card>
      <Card style={s.card}><Text accessibilityRole="header" style={pageStyles.section}>Location</Text><View style={s.line}><Icon name="map-pin" color={colors.muted} /><Text selectable style={s.value}>{job.address || 'Address not provided'}</Text></View></Card>
      <View style={s.note}><Icon name="info" size={16} color={colors.muted} /><Text style={[pageStyles.subtle, { flex: 1 }]}>Contact dispatch for appointment or status changes.</Text></View>
    </>}
  </ScrollView>;
}
const s = StyleSheet.create({
  back: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', paddingRight: 20 }, backText: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink }, card: { gap: 16 }, request: { fontFamily: fonts.regular, fontSize: 15, color: colors.ink, lineHeight: 25 }, status: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, backgroundColor: '#EEEFE8', paddingHorizontal: 14, paddingVertical: 9 }, dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ink }, statusText: { fontFamily: fonts.medium, color: colors.ink, fontSize: 12 }, line: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' }, value: { flex: 1, fontFamily: fonts.regular, color: colors.ink, fontSize: 14, lineHeight: 23 }, note: { flexDirection: 'row', gap: 8, maxWidth: 640 },
});
