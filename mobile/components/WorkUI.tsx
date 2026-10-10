import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Icon } from './ui';
import { dayLabel, timeLabel } from '../lib/day';
import { colors, fonts } from '../lib/theme';
import { services, statusLabels, type WorkJob } from '../lib/model';
import { workPageSize } from '../lib/jobs';

export function PageHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <View style={s.heading}><Text style={s.eyebrow}>{eyebrow}</Text><Text accessibilityRole="header" style={s.title}>{title}</Text><Text style={s.detail}>{detail}</Text></View>;
}
export function QueryState({ busy, error, hasData, retry }: { busy: boolean; error: string | null; hasData: boolean; retry(): void }) {
  if (error) return <Card style={s.errorCard}><Text accessibilityRole="alert" style={s.error}>{error}</Text>
    {hasData && <Text style={s.errorDetail}>Showing the last successful update. Work may have changed.</Text>}<Button label="Try again" secondary onPress={retry} disabled={busy} /></Card>;
  if (busy && !hasData) return <Card><ActivityIndicator color={colors.ink} /><Text style={s.loading}>Loading your workspace…</Text></Card>;
  return null;
}
export function JobList({ jobs, showDate = false }: { jobs: WorkJob[]; showDate?: boolean }) {
  const [width, setWidth] = useState(0);
  const columns = width >= 680;
  return <View style={s.grid} onLayout={event => setWidth(event.nativeEvent.layout.width)}>{jobs.map(job => <View key={job.id} style={columns ? s.half : s.full}><JobCard job={job} showDate={showDate} /></View>)}</View>;
}
export function JobCard({ job, showDate = false }: { job: WorkJob; showDate?: boolean }) {
  const complete = job.status === 'completed';
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open job for ${job.clientName}: ${job.request}`}
    onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: job.id } })} style={({ pressed }) => pressed && { opacity: 0.7 }}>
    <Card style={s.job}>
      <View style={s.jobTop}><View style={s.time}><Icon name={job.scheduled_start ? 'clock' : 'calendar'} size={14} /><Text style={s.timeText}>{job.scheduled_start ? timeLabel(job.scheduled_start) : 'Not scheduled'}</Text></View>
        <View style={[s.status, complete && s.complete]}><Text style={[s.statusText, complete && s.completeText]}>{statusLabels[job.status]}</Text></View></View>
      <View style={s.clientRow}><Text style={s.client}>{job.clientName}</Text><Icon name="arrow-up-right" color={colors.muted} size={18} /></View>
      <Text style={s.request} numberOfLines={3}>{job.request}</Text>
      <View style={s.service}><Icon name={job.service === 'locksmith' ? 'key' : job.service === 'skincare' ? 'sun' : 'tool'} size={14} color={colors.muted} /><Text style={s.serviceText}>{services[job.service]}</Text></View>
      {showDate && job.scheduled_start && <Text style={s.date}>{dayLabel(new Date(job.scheduled_start))}</Text>}
      {!!job.address && <View style={s.address}><Icon name="map-pin" size={14} color={colors.muted} /><Text style={s.addressText}>{job.address}</Text></View>}
    </Card>
  </Pressable>;
}
export function PageControls({ page, total, busy, onPage }: { page: number; total: number; busy: boolean; onPage(page: number): void }) {
  if (total <= workPageSize && page === 0) return null;
  return <View style={s.pagination}><Text style={s.pageText}>{total ? `${page * workPageSize + 1}–${Math.min((page + 1) * workPageSize, total)} of ${total}` : 'No work on this page'}</Text>
    <View style={s.pageButtons}><Button label="Previous" icon="chevron-left" secondary disabled={busy || page === 0} onPress={() => onPage(page - 1)} /><Button label="Next" icon="chevron-right" secondary disabled={busy || (page + 1) * workPageSize >= total} onPress={() => onPage(page + 1)} /></View>
  </View>;
}
export const pageStyles = StyleSheet.create({
  page: { padding: 22, paddingBottom: 40, gap: 20, maxWidth: 1120, width: '100%', alignSelf: 'center' },
  section: { fontFamily: fonts.semibold, fontSize: 18, color: colors.ink },
  subtle: { fontFamily: fonts.regular, color: colors.muted, fontSize: 13, lineHeight: 21 },
});
const s = StyleSheet.create({
  heading: { gap: 10, marginTop: 10, marginBottom: 4 }, eyebrow: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1.5 }, title: { color: colors.ink, fontFamily: fonts.bold, fontSize: 32, lineHeight: 40, letterSpacing: -1.3 }, detail: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 22 },
  errorCard: { backgroundColor: colors.redWash, gap: 12 }, error: { color: colors.red, fontFamily: fonts.medium, fontSize: 14, lineHeight: 21 }, errorDetail: { fontFamily: fonts.regular, color: colors.red, fontSize: 12, lineHeight: 19 }, loading: { textAlign: 'center', marginTop: 14, fontFamily: fonts.regular, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, full: { width: '100%' }, half: { width: '48%', flexGrow: 1 }, job: { gap: 12 }, jobTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }, time: { flexDirection: 'row', gap: 6, alignItems: 'center' }, timeText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.ink }, status: { backgroundColor: colors.paper, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6 }, statusText: { fontFamily: fonts.medium, color: colors.muted, fontSize: 11 }, complete: { backgroundColor: colors.greenWash }, completeText: { color: colors.green },
  clientRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between', alignItems: 'center' }, client: { fontFamily: fonts.semibold, fontSize: 18, color: colors.ink, flex: 1 }, request: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, color: colors.muted }, service: { flexDirection: 'row', gap: 7, alignItems: 'center' }, serviceText: { fontFamily: fonts.medium, fontSize: 11, color: colors.muted }, address: { flexDirection: 'row', gap: 8, paddingTop: 12, borderTopWidth: 1, borderColor: colors.line }, addressText: { fontFamily: fonts.regular, color: colors.muted, fontSize: 12, lineHeight: 19, flex: 1 }, date: { fontFamily: fonts.regular, color: colors.muted, fontSize: 12 },
  pagination: { gap: 12 }, pageText: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 }, pageButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
