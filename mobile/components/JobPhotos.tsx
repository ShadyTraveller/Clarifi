import { useCallback, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { useWorkspaceQuery } from '../lib/use-workspace-query';
import { colors, fonts } from '../lib/theme';
import { Button, Card, Icon } from './ui';
import { PageControls, QueryState, pageStyles } from './WorkUI';

export function JobPhotos({ jobId }: { jobId: string }) {
  const { db, member } = useAuth();
  const [page, setPage] = useState(0);
  const load = useCallback(async (signal: AbortSignal) => {
    const response = await db!.from('job_files').select('id,file_name,mime_type,storage_path', { count: 'exact' })
      .eq('organization_id', member!.organization_id).eq('job_id', jobId).like('mime_type', 'image/%')
      .order('created_at').order('id').range(page * 25, page * 25 + 24).abortSignal(signal);
    if (response.error) throw new Error('Could not load photos.');
    const photos = await Promise.all((response.data ?? []).map(async row => {
      if (!row.storage_path.startsWith(`${jobId}/`)) return { ...row, url: null as string | null };
      const signed = await db!.storage.from('job-files').createSignedUrl(row.storage_path, 3600);
      return { ...row, url: signed.error ? null : signed.data.signedUrl };
    }));
    signal.throwIfAborted();
    return { photos, total: response.count ?? photos.length };
  }, [db, member, jobId, page]);
  const { data, busy, error, refresh } = useWorkspaceQuery(`${member!.id}:${jobId}:photos:${page}`, load);
  return <View style={s.section}><View style={s.header}><Text accessibilityRole="header" style={pageStyles.section}>Photos</Text><Button label="Refresh photos" icon="refresh-cw" secondary disabled={busy} onPress={() => { void refresh(); }} /></View>
    <QueryState busy={busy} error={error} hasData={!!data} retry={() => { void refresh(); }} />
    {data && !data.total && <Card><View style={s.empty}><Icon name="image" color={colors.muted} /><Text style={pageStyles.subtle}>No photos attached yet.</Text></View></Card>}
    {data?.photos.map(photo => <Card key={photo.id} style={s.photo}>{photo.url ? <SignedImage key={photo.url} url={photo.url} name={photo.file_name} /> : <Text style={pageStyles.subtle}>This photo is unavailable. Refresh to try again.</Text>}<Text selectable style={s.caption}>{photo.file_name}</Text></Card>)}
    {data && <PageControls page={page} total={data.total} busy={busy} onPage={setPage} />}
  </View>;
}
function SignedImage({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <Text style={pageStyles.subtle}>Could not display this photo. Refresh to try again.</Text> : <Image key={url} source={{ uri: url }} accessibilityLabel={`Job photo ${name}`} style={s.image} resizeMode="contain" onError={() => setFailed(true)} />;
}
const s = StyleSheet.create({
  section: { gap: 16 }, header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, empty: { flexDirection: 'row', gap: 12, alignItems: 'center' }, photo: { gap: 12 }, image: { width: '100%', height: 240, borderRadius: 12, backgroundColor: colors.paper }, caption: { fontFamily: fonts.medium, color: colors.ink, fontSize: 12, lineHeight: 19 },
});
