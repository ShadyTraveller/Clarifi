import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { calendarPeriod, dateForKey, torontoDateKey, type CalendarMode } from '../lib/calendar';
import { torontoDayBounds, dayLabel } from '../lib/day';
import { fetchWork } from '../lib/jobs';
import { useWorkspaceQuery } from '../lib/use-workspace-query';
import { colors, fonts } from '../lib/theme';
import { Button, Card, Icon, StateMessage } from '../components/ui';
import { JobList, PageControls, PageHeading, QueryState, pageStyles } from '../components/WorkUI';

export default function Schedule() {
  const { member } = useAuth();
  return member ? <Agenda key={member.id} /> : null;
}
function Agenda() {
  const { db, member } = useAuth();
  const wide = useWindowDimensions().width >= 1180;
  const [mode, setMode] = useState<CalendarMode>('week');
  const [offset, setOffset] = useState(0), [selected, setSelected] = useState(torontoDateKey()), [page, setPage] = useState(0);
  const [anchor, setAnchor] = useState(torontoDateKey());
  const period = useMemo(() => calendarPeriod(mode, offset, dateForKey(anchor)), [mode, offset, anchor]);
  const selectedDay = period.days.some(day => day.key === selected) ? selected : period.days[0].key;
  const bounds = torontoDayBounds(dateForKey(selectedDay));
  const load = useCallback((signal: AbortSignal) => fetchWork(db!, member!, signal, { start: bounds.start, end: bounds.end, page }), [db, member, bounds.start, bounds.end, page]);
  const { data, busy, error, refresh } = useWorkspaceQuery(`${member!.id}:${selectedDay}:${page}`, load);
  function changePeriod(delta: number) { setOffset(value => value + delta); setPage(0); }
  function changeMode(next: CalendarMode) { setAnchor(selectedDay); setSelected(selectedDay); setMode(next); setOffset(0); setPage(0); }
  return <ScrollView testID="schedule-screen" contentContainerStyle={pageStyles.page} refreshControl={<RefreshControl refreshing={busy && !!data} onRefresh={() => { void refresh(); }} />}>
    <PageHeading eyebrow="YOUR CALENDAR" title="A little more clarity." detail="Plan the week. See the month. All appointments use Toronto time." />
    <View style={s.toolbar}><View accessibilityRole="tablist" style={s.segment}>{(['week', 'month'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityLabel={value === 'week' ? 'Week view' : 'Month view'} accessibilityState={{ selected: mode === value }} aria-selected={mode === value} onPress={() => changeMode(value)} style={({ pressed }) => [s.mode, mode === value && s.modeSelected, pressed && s.pressed]}><Text style={[s.modeText, mode === value && s.selectedText]}>{value === 'week' ? 'Week' : 'Month'}</Text></Pressable>)}</View>
      <Button label="Today" secondary onPress={() => { setAnchor(torontoDateKey()); setOffset(0); setSelected(torontoDateKey()); setPage(0); }} />
    </View>
    <View style={[s.layout, wide && s.wideLayout]}>
    <View style={wide && s.calendarPane}><Card style={s.calendar}>
      <View style={s.period}><Text accessibilityRole="header" style={s.periodTitle}>{period.title}</Text><View style={s.arrows}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Previous ${mode}`} onPress={() => changePeriod(-1)} style={s.arrow}><Icon name="chevron-left" /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Next ${mode}`} onPress={() => changePeriod(1)} style={s.arrow}><Icon name="chevron-right" /></Pressable>
      </View></View>
      <View style={s.weekdays}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <View key={index} style={s.cell}><Text style={s.weekday}>{day}</Text></View>)}</View>
      <View style={s.days}>
        {mode === 'month' && Array.from({ length: period.leading }, (_, index) => <View key={`blank-${index}`} style={s.cell} />)}
        {period.days.map(day => <Pressable key={day.key} accessibilityRole="button" accessibilityLabel={`Show appointments for ${dayLabel(day.date)}`} accessibilityState={{ selected: selectedDay === day.key }} aria-pressed={selectedDay === day.key} onPress={() => { setSelected(day.key); setPage(0); }} style={({ pressed }) => [s.cell, pressed && s.pressed]}>
          <View style={[s.dayCircle, torontoDateKey() === day.key && s.today, selectedDay === day.key && s.chosen]}><Text style={[s.dayNumber, selectedDay === day.key && s.chosenText]}>{day.number}</Text></View>
        </Pressable>)}
      </View>
    </Card></View>
    <View style={[s.agendaPane, wide && { flex: 1 }]}>
    <View style={s.agendaHeading}><View style={{ flex: 1 }}><Text accessibilityRole="header" style={pageStyles.section}>{dayLabel(dateForKey(selectedDay))}</Text><Text style={s.agendaDetail}>{member!.role === 'technician' ? 'Your assigned appointments' : 'Your team’s appointments'}</Text></View>{data && <Text style={s.count}>{data.total}</Text>}</View>
    <QueryState busy={busy} error={error} hasData={!!data} retry={() => { void refresh(); }} />
    {data && (data.jobs.length ? <JobList jobs={data.jobs} /> : <Card><StateMessage title="Space in the schedule" detail="No appointments for this day. Choose another date to see what’s planned." icon="calendar" /></Card>)}
    {data && <PageControls page={page} total={data.total} busy={busy} onPage={setPage} />}
    </View></View>
    <View style={s.note}><Icon name="info" size={16} color={colors.muted} /><Text style={pageStyles.subtle}>Dispatch manages scheduling and assignments. Pull down to refresh.</Text></View>
  </ScrollView>;
}
const s = StyleSheet.create({
  toolbar: { flexDirection: 'row', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }, segment: { flexDirection: 'row', padding: 4, borderRadius: 28, backgroundColor: '#EEEFE8' }, mode: { paddingHorizontal: 24, minHeight: 44, justifyContent: 'center', borderRadius: 24 }, modeSelected: { backgroundColor: colors.white }, modeText: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13 }, selectedText: { color: colors.ink, fontFamily: fonts.semibold },
  layout: { gap: 24 }, wideLayout: { flexDirection: 'row', alignItems: 'flex-start' }, calendarPane: { width: '42%' }, agendaPane: { gap: 20, minWidth: 0 },
  calendar: { padding: 16, gap: 8, maxWidth: 720, width: '100%' }, period: { flexDirection: 'row', alignItems: 'center', gap: 8 }, periodTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.ink, lineHeight: 23 }, arrows: { flexDirection: 'row' }, arrow: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 }, weekdays: { flexDirection: 'row' }, days: { flexDirection: 'row', flexWrap: 'wrap' }, cell: { width: '14.2857%', minHeight: 48, alignItems: 'center', justifyContent: 'center' }, weekday: { fontFamily: fonts.medium, fontSize: 11, color: colors.muted }, dayCircle: { width: 36, minHeight: 36, borderRadius: 18, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' }, today: { borderColor: colors.ink }, chosen: { backgroundColor: colors.ink }, dayNumber: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink }, chosenText: { color: colors.yellow },
  agendaHeading: { flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 8 }, agendaDetail: { fontFamily: fonts.regular, color: colors.muted, fontSize: 13, marginTop: 6 }, count: { fontFamily: fonts.semibold, backgroundColor: '#EEEFE8', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, color: colors.ink }, note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', maxWidth: 640 }, pressed: { opacity: 0.6 },
});
