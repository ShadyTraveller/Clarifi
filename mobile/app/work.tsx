import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { fetchWork } from '../lib/jobs';
import { jobStatuses, type JobStatus } from '../lib/model';
import { useWorkspaceQuery } from '../lib/use-workspace-query';
import { colors, fonts } from '../lib/theme';
import { Card, Icon, StateMessage } from '../components/ui';
import { JobList, PageControls, PageHeading, QueryState, pageStyles } from '../components/WorkUI';

const labels = { lead: 'Requests', estimate: 'Estimates', active: 'Jobs', completed: 'Completed' };
export default function Work() {
  const { member } = useAuth();
  return member ? <WorkList key={member.id} /> : null;
}
function WorkList() {
  const { db, member } = useAuth();
  const [status, setStatus] = useState<JobStatus>(member!.role === 'technician' ? 'active' : 'lead');
  const [input, setInput] = useState(''), [search, setSearch] = useState(''), [page, setPage] = useState(0);
  const load = useCallback((signal: AbortSignal) => fetchWork(db!, member!, signal, { status, page, search }), [db, member, status, page, search]);
  const { data, busy, error, refresh } = useWorkspaceQuery(`${member!.id}:${status}:${page}:${search}`, load);
  function submitSearch() { setSearch(input.trim()); setPage(0); }
  return <ScrollView testID="work-screen" keyboardShouldPersistTaps="handled" contentContainerStyle={pageStyles.page} refreshControl={<RefreshControl refreshing={busy && !!data} onRefresh={() => { void refresh(); }} />}>
    <PageHeading eyebrow="THE WORKSPACE" title="Everything in its place." detail={member!.role === 'technician' ? 'Your assigned work, from first request to a job well done.' : 'Follow each request from the first conversation to completion.'} />
    <View style={s.search}><Icon name="search" size={19} color={colors.muted} /><TextInput accessibilityLabel="Search job details" placeholder="Search job details" placeholderTextColor={colors.muted} value={input} onChangeText={setInput} onSubmitEditing={submitSearch} returnKeyType="search" style={s.input} autoCapitalize="none" />
      {!!input && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => { setInput(''); setSearch(''); setPage(0); }} style={s.searchButton}><Icon name="x" color={colors.muted} size={18} /></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="Search work" onPress={submitSearch} style={s.searchButton}><Icon name="arrow-right" size={18} /></Pressable>
    </View>
    <View accessibilityRole="tablist" style={s.filters}>{jobStatuses.map(value => <Pressable key={value} accessibilityRole="tab" accessibilityLabel={labels[value]} accessibilityState={{ selected: status === value }} aria-selected={status === value} onPress={() => { setStatus(value); setPage(0); }} style={({ pressed }) => [s.filter, status === value && s.activeFilter, pressed && { opacity: 0.65 }]}><Text style={[s.filterText, status === value && s.activeText]}>{labels[value]}</Text></Pressable>)}</View>
    <View style={s.listHeading}><Text accessibilityRole="header" style={pageStyles.section}>{labels[status]}</Text><Text accessibilityLiveRegion="polite" style={pageStyles.subtle}>{data ? `${data.total} ${data.total === 1 ? 'item' : 'items'}` : 'Loading…'}</Text></View>
    {!!search && <Text style={pageStyles.subtle}>Job details matching “{search}”</Text>}
    <QueryState busy={busy} error={error} hasData={!!data} retry={() => { void refresh(); }} />
    {data && (data.jobs.length ? <JobList jobs={data.jobs} showDate /> : <Card><StateMessage title={search ? 'No matching work' : `No ${labels[status].toLowerCase()} yet`} detail={search ? 'Try another word, or clear your search to see all work in this stage.' : 'Work will appear here as your team moves requests through the day.'} icon="briefcase" /></Card>)}
    {data && <PageControls page={page} total={data.total} busy={busy} onPage={setPage} />}
  </ScrollView>;
}
const s = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEEFE8', borderRadius: 28, paddingLeft: 18, paddingRight: 4, gap: 12, minHeight: 56 }, input: { flex: 1, minWidth: 0, fontFamily: fonts.regular, fontSize: 14, color: colors.ink, paddingVertical: 16 }, searchButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, filter: { paddingHorizontal: 16, paddingVertical: 13, minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 24, justifyContent: 'center' }, activeFilter: { backgroundColor: colors.ink, borderColor: colors.ink }, filterText: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 }, activeText: { color: colors.yellow }, listHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 8 },
});
