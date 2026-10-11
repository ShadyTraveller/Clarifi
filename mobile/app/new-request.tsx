import { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type TextInputProps } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { hasExtension } from '@yavamo/core/classify';
import { useAuth } from '../lib/auth';
import { useEntry } from '../lib/entry-context';
import { createLead, findClients, uploadEntryPhoto } from '../lib/entry-api';
import { relationships, sanitizePhotoName, validateEntry, validatePhoto, type ClientMatch, type EntryDraft, type EntryPhoto } from '../lib/entry-model';
import { services } from '../lib/model';
import { colors, fonts } from '../lib/theme';
import { Button, Card, Icon, type IconName } from '../components/ui';
import { PageHeading, pageStyles } from '../components/WorkUI';

async function photoBytes(photo: Pick<EntryPhoto, 'uri'>) {
  if (Platform.OS !== 'web') return new File(photo.uri).arrayBuffer();
  const response = await fetch(photo.uri);
  return response.arrayBuffer();
}
export default function NewRequest() {
  const { member } = useAuth();
  return member && member.role !== 'technician' ? <EntryForm key={member.id} /> : null;
}
function EntryForm() {
  const { db, member } = useAuth();
  const { state, setState, reset, controller } = useEntry();
  const { draft, client, photos, attemptId, jobId } = state;
  const wide = useWindowDimensions().width >= 1180;
  const [errors, setErrors] = useState<ReturnType<typeof validateEntry>>({});
  const [matches, setMatches] = useState<ClientMatch[]>([]), [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false), [picking, setPicking] = useState(false), [message, setMessage] = useState('');
  const pending = useRef(false), lookup = useRef<AbortController | null>(null);
  const locked = busy || !!attemptId;
  useEffect(() => () => { lookup.current?.abort(); }, []);
  function update(field: keyof EntryDraft, value: string) {
    if (locked || client) return;
    lookup.current?.abort(); setMatches([]); setChecked(false); setMessage('');
    setErrors(previous => ({ ...previous, [field]: undefined }));
    setState(previous => ({ ...previous, draft: { ...previous.draft, [field]: value } }));
  }
  function updateRequest(field: 'request' | 'details' | 'unit' | 'gate' | 'service', value: string) {
    if (locked) return;
    setErrors(previous => ({ ...previous, [field]: undefined }));
    setState(previous => ({ ...previous, draft: { ...previous.draft, [field]: value } }));
  }
  async function checkClient() {
    if (pending.current) return;
    const invalid = validateEntry({ ...draft, request: draft.request || 'Lookup' }); setErrors(invalid);
    if (Object.keys(invalid).length) return;
    pending.current = true; setBusy(true); setMessage(''); setChecked(false);
    lookup.current?.abort(); const abort = new AbortController(); lookup.current = abort;
    try {
      const found = await findClients(db!, member!, draft, abort.signal);
      if (!abort.signal.aborted) { setMatches(found); setChecked(true); }
    } catch { if (!abort.signal.aborted) setMessage('Could not check existing clients. Your entry is kept; try again.'); }
    finally { pending.current = false; setBusy(false); }
  }
  function chooseClient(match: ClientMatch) {
    setState(previous => ({ ...previous, client: match, draft: { ...previous.draft, name: match.name, email: match.email ?? '', phone: match.phone ?? '', address: match.address ?? '', relationship: match.relationship } }));
    setMatches([]); setErrors({}); setMessage('');
  }
  async function pickPhotos(camera: boolean) {
    if (picking || locked) return;
    setPicking(true); setMessage('');
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { setMessage('Camera access is off. Choose a photo from your library instead.'); return; }
      }
      const result = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.85 });
      if (result.canceled) return;
      const added: EntryPhoto[] = [];
      for (const asset of result.assets) {
        const name = sanitizePhotoName(asset.fileName ?? 'photo.jpg');
        const mime = asset.mimeType ?? 'image/jpeg';
        const size = asset.fileSize ?? (await photoBytes({ uri: asset.uri })).byteLength;
        const failure = validatePhoto(size, mime);
        if (failure) { setMessage(failure); continue; }
        added.push({ id: randomUUID(), uri: asset.uri, name, mime, size, saved: false });
      }
      setState(previous => ({ ...previous, photos: [...previous.photos, ...added] }));
    } catch { setMessage('Could not open that photo. Choose it again.'); }
    finally { setPicking(false); }
  }
  async function submit() {
    if (pending.current || picking) return;
    const invalid = validateEntry(draft); setErrors(invalid);
    if (Object.keys(invalid).length) { setMessage('Check the highlighted fields before saving.'); return; }
    if (!client) { setMessage('Check for an existing client and choose a match before saving. New clients are temporarily unavailable.'); return; }
    pending.current = true; setBusy(true); setMessage('');
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const id = attemptId ?? randomUUID();
    setState(previous => ({ ...previous, attemptId: id }));
    try {
      const savedId = jobId ?? await createLead(db!, member!, draft, client, id, abort.signal);
      setState(previous => ({ ...previous, jobId: savedId }));
      let failed = 0;
      for (const photo of photos.filter(item => !item.saved)) {
        abort.signal.throwIfAborted();
        try {
          const bytes = await photoBytes(photo);
          await uploadEntryPhoto(db!, member!, savedId, client.id, photo, bytes, abort.signal);
          setState(previous => ({ ...previous, photos: previous.photos.map(item => item.id === photo.id ? { ...item, saved: true } : item) }));
        } catch { if (abort.signal.aborted) throw new Error('Cancelled'); failed++; }
      }
      if (!abort.signal.aborted) setMessage(failed ? 'Request saved. Some photos could not be attached. Retry photos to finish; this will not create another request.' : 'Request saved. Dispatch can now review and schedule it.');
    } catch (failure) {
      if (!abort.signal.aborted) setMessage(failure instanceof Error ? failure.message : 'Could not confirm the save. Your entry is kept.');
    } finally { pending.current = false; setBusy(false); }
  }
  const remaining = photos.filter(photo => !photo.saved).length;
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView testID="entry-screen" keyboardShouldPersistTaps="handled" contentContainerStyle={pageStyles.page}>
      <PageHeading eyebrow="CLIENT QUICK-ENTRY" title="Start with the essentials." detail="One clear request. The right contact. Photos that tell the story." />
      {jobId && <Card style={s.success}><Icon name="check-circle" color={colors.green} /><Text accessibilityRole="header" style={s.section}>Request saved</Text><Text style={s.hint}>{remaining ? `${remaining} ${remaining === 1 ? 'photo still needs' : 'photos still need'} attaching.` : 'Ready for dispatch to review.'}</Text><Button label="Open request" icon="arrow-up-right" onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: jobId } })} /></Card>}
      <View style={[s.columns, wide && s.wide]}>
        <View style={[s.column, wide && { flex: 1 }]}><Card style={s.card}>
          <Section number="01" title="Who’s the client?" icon="user" />
          <Field label="Client name" value={draft.name} onChangeText={value => update('name', value)} error={errors.name} editable={!locked && !client} autoCapitalize="words" required />
          <Field label="Phone" value={draft.phone} onChangeText={value => update('phone', value)} error={errors.phone} editable={!locked && !client} keyboardType="phone-pad" />
          {hasExtension(draft.phone) && <Text style={s.warning}>This number has an extension — ask for a direct line.</Text>}
          <Field label="Email" value={draft.email} onChangeText={value => update('email', value)} error={errors.email} editable={!locked && !client} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Street address" value={draft.address} onChangeText={value => update('address', value)} editable={!locked && !client} autoCapitalize="words" />
          <Text style={s.label}>Relationship</Text><View accessibilityRole="radiogroup" accessibilityLabel="Client relationship" style={s.choices}>{Object.entries(relationships).map(([value, label]) => <Choice key={value} label={label} selected={draft.relationship === value} disabled={locked || !!client} onPress={() => update('relationship', value)} />)}</View>
          {client ? <View style={s.match}><Icon name="check" color={colors.green} size={18} /><Text style={[s.hint, { flex: 1 }]}>Existing client selected. Their contact details stay unchanged.</Text>{!locked && <Button label="Change client" secondary onPress={() => { setState(previous => ({ ...previous, client: null })); setChecked(false); }} />}</View> : <>
            <Button label="Check existing client" secondary icon="search" busy={busy && !attemptId} disabled={locked} onPress={checkClient} />
            {checked && !matches.length && <Text accessibilityLiveRegion="polite" style={s.hint}>No matching client found. New clients are temporarily unavailable; contact dispatch or check another email or phone.</Text>}
            {matches.length > 0 && <View style={s.matches}><Text style={s.label}>Choose the client for this request</Text>{matches.map(match => <Pressable key={match.id} accessibilityRole="button" accessibilityLabel={`Use client ${match.name}`} onPress={() => chooseClient(match)} style={s.matchOption}><Text style={s.matchName}>{match.name}</Text><Text style={s.hint}>{match.email || match.phone || 'Existing client'}</Text><Text style={s.hint}>{match.address || 'No address provided'}</Text></Pressable>)}</View>}
          </>}
        </Card></View>
        <View style={[s.column, wide && { flex: 1 }]}><Card style={s.card}>
          <Section number="02" title="What needs doing?" icon="briefcase" />
          <Text style={s.label}>Service</Text><View accessibilityRole="radiogroup" accessibilityLabel="Requested service" style={s.choices}>{Object.entries(services).map(([value, label]) => <Choice key={value} label={label} selected={draft.service === value} disabled={locked} onPress={() => updateRequest('service', value)} />)}</View>
          {draft.service === 'security_film' && <Text style={s.warning}>Security film request entry is awaiting setup. Contact dispatch.</Text>}
          <Field label="Request title" value={draft.request} onChangeText={value => updateRequest('request', value)} error={errors.request} editable={!locked} required placeholder="e.g. Rekey the front door lock" />
          <Field label="Job details" value={draft.details} onChangeText={value => updateRequest('details', value)} editable={!locked} multiline numberOfLines={4} placeholder="What happened? What should the team know?" />
          <View style={s.accessFields}><View style={{ flex: 1 }}><Field label="Unit" value={draft.unit} onChangeText={value => updateRequest('unit', value)} editable={!locked} /></View><View style={{ flex: 1 }}><Field label="Gate code" value={draft.gate} onChangeText={value => updateRequest('gate', value)} editable={!locked} /></View></View>
          <Text style={s.hint}>Unit and gate instructions stay with this request.</Text>
        </Card>
        <Card style={s.card}><Section number="03" title="Show the details" icon="image" /><Text style={s.hint}>Optional photos · images only · up to 4 MB each</Text>
          <View style={s.photoActions}><Button label="Choose photos" secondary icon="image" busy={picking} disabled={locked} onPress={() => { void pickPhotos(false); }} /><Button label="Take photo" secondary icon="camera" disabled={locked || picking} onPress={() => { void pickPhotos(true); }} /></View>
          {photos.map(photo => <View key={photo.id} style={s.photo}><Image source={{ uri: photo.uri }} style={s.thumbnail} accessibilityLabel={`Photo ${photo.name}`} /><View style={{ flex: 1 }}><Text style={s.photoName} numberOfLines={2}>{photo.name}</Text><Text style={s.hint}>{photo.saved ? 'Attached' : `${(photo.size / 1024 / 1024).toFixed(1)} MB`}</Text></View>{!locked && <Pressable accessibilityRole="button" accessibilityLabel={`Remove photo ${photo.name}`} onPress={() => setState(previous => ({ ...previous, photos: previous.photos.filter(item => item.id !== photo.id) }))} style={s.remove}><Icon name="x" size={18} /></Pressable>}</View>)}
        </Card></View>
      </View>
      {!!message && <Card style={jobId ? s.success : s.notice}><Text accessibilityRole="alert" style={s.hint}>{message}</Text></Card>}
      {attemptId && !jobId && <Text style={s.hint}>This save is still unconfirmed. Retry checks the same request. Your entry is kept when you switch screens.</Text>}
      <View style={s.footer}><Text style={[s.hint, { flex: 1 }]}>Requests start in the queue. Scheduling and assignment come later.</Text>
        {!jobId || remaining ? <Button label={jobId ? 'Retry photos' : attemptId ? 'Retry save' : 'Save request'} icon="arrow-right" busy={busy} disabled={picking || !client || draft.service === 'security_film'} onPress={() => { void submit(); }} /> : <Button label="Create another request" icon="plus" onPress={() => { reset(); setChecked(false); setMatches([]); setMessage(''); setErrors({}); }} />}
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
function Section({ number, title, icon }: { number: string; title: string; icon: IconName }) {
  return <View style={s.sectionRow}><View style={s.sectionIcon}><Icon name={icon} size={19} /></View><Text accessibilityRole="header" style={s.section}>{title}</Text><Text style={s.number}>{number}</Text></View>;
}
function Field({ label, error, required, ...props }: TextInputProps & { label: string; error?: string; required?: boolean }) {
  return <View style={s.field}><Text style={s.label}>{label}{required ? ' *' : ''}</Text><TextInput accessibilityLabel={label} aria-invalid={!!error} style={[s.input, props.multiline && s.multiline, props.editable === false && s.readOnly, !!error && s.invalid]} placeholderTextColor={colors.muted} autoCorrect={false} {...props} />{!!error && <Text accessibilityRole="alert" style={s.fieldError}>{error}</Text>}</View>;
}
function Choice({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected, disabled }} aria-checked={selected} aria-disabled={disabled} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.choice, selected && s.selectedChoice, pressed && { opacity: 0.65 }]}><Text style={[s.choiceText, selected && s.selectedChoiceText]}>{label}</Text></Pressable>;
}
const s = StyleSheet.create({
  columns: { gap: 20 }, wide: { flexDirection: 'row', alignItems: 'flex-start' }, column: { gap: 20, minWidth: 0 }, card: { gap: 18 }, sectionRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 4 }, sectionIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#EEEFE8', alignItems: 'center', justifyContent: 'center' }, section: { flex: 1, color: colors.ink, fontFamily: fonts.semibold, fontSize: 17 }, number: { color: colors.muted, fontFamily: fonts.medium, fontSize: 11 }, field: { gap: 8 }, label: { color: colors.ink, fontFamily: fonts.medium, fontSize: 13 }, input: { minHeight: 52, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, color: colors.ink, fontFamily: fonts.regular, fontSize: 15, backgroundColor: colors.paper }, multiline: { minHeight: 124, textAlignVertical: 'top' }, readOnly: { backgroundColor: '#EEEFE8' }, invalid: { borderColor: colors.red }, fieldError: { fontFamily: fonts.regular, color: colors.red, fontSize: 12, lineHeight: 18 }, hint: { fontFamily: fonts.regular, color: colors.muted, fontSize: 13, lineHeight: 21 }, warning: { color: '#875A12', fontFamily: fonts.medium, fontSize: 13, lineHeight: 21 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'center', borderRadius: 24, borderWidth: 1, borderColor: colors.line }, selectedChoice: { backgroundColor: colors.ink, borderColor: colors.ink }, choiceText: { color: colors.muted, fontFamily: fonts.medium, fontSize: 12 }, selectedChoiceText: { color: colors.yellow }, accessFields: { flexDirection: 'row', gap: 12 }, match: { gap: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }, matches: { gap: 10 }, matchOption: { padding: 16, borderRadius: 16, backgroundColor: colors.paper, gap: 4, borderWidth: 1, borderColor: colors.line }, matchName: { fontFamily: fonts.semibold, color: colors.ink, fontSize: 15 }, photoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, photo: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, borderTopWidth: 1, borderColor: colors.line }, thumbnail: { width: 64, height: 64, borderRadius: 12 }, photoName: { fontFamily: fonts.medium, fontSize: 12, color: colors.ink }, remove: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' }, success: { backgroundColor: colors.greenWash, gap: 12 }, notice: { backgroundColor: colors.paper, gap: 12 }, footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, alignItems: 'center', paddingVertical: 8 },
});
