import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Icon } from './ui';
import { useAuth } from '../lib/auth';
import { colors, fonts } from '../lib/theme';

export function SignIn() {
  const { db } = useAuth();
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function signIn() {
    if (busy || !db) return;
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) { setError('Enter your work email and password.'); return; }
    setBusy(true);
    try {
      const { error: failure } = await db.auth.signInWithPassword({ email: email.trim(), password });
      if (failure) setError(failure.status === 400 ? 'Email or password is incorrect. Please try again.' : 'Could not sign in. Check your connection and try again.');
      else setPassword('');
    } catch { setError('Could not sign in. Check your connection and try again.'); }
    finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
      <View style={s.wordmark}><View style={s.mark}><Text style={s.markText}>y</Text></View><Text style={s.brand}>yavamo</Text></View>
      <View style={s.hero}><Text style={s.eyebrow}>YOUR WORKDAY, IN HAND</Text><Text style={s.title}>Good work.{ '\n' }Less busywork.</Text><Text style={s.subtitle}>Your team, appointments, and next job. All together.</Text></View>
      <View style={s.form}><Text style={s.formTitle}>Sign in to your workspace</Text>
        <Text style={s.label}>Work email</Text><TextInput accessibilityLabel="Work email" style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="you@company.com" placeholderTextColor={colors.muted} editable={!busy} />
        <Text style={s.label}>Password</Text><TextInput accessibilityLabel="Password" style={s.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" onSubmitEditing={signIn} returnKeyType="go" editable={!busy} />
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        <Button label="Sign in" icon="arrow-right" onPress={signIn} busy={busy} />
        <Text style={s.help}>Need access or a password reset? Contact your workspace administrator.</Text>
      </View>
      <View style={s.footer}><Icon name="lock" size={14} color={colors.muted} /><Text style={s.footerText}>For your office and field team</Text></View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({
  page: { flexGrow: 1, padding: 24, gap: 32, justifyContent: 'center', maxWidth: 520, width: '100%', alignSelf: 'center' },
  wordmark: { flexDirection: 'row', gap: 10, alignItems: 'center' }, mark: { backgroundColor: colors.yellow, width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: fonts.bold, fontSize: 29, color: colors.ink }, brand: { fontFamily: fonts.bold, fontSize: 25, color: colors.ink, letterSpacing: -1 },
  hero: { gap: 14 }, eyebrow: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.6, color: colors.muted }, title: { fontFamily: fonts.bold, fontSize: 42, lineHeight: 48, color: colors.ink, letterSpacing: -1.8 }, subtitle: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 25, color: colors.muted },
  form: { gap: 12 }, formTitle: { fontFamily: fonts.semibold, fontSize: 18, color: colors.ink, marginBottom: 8 }, label: { fontFamily: fonts.medium, color: colors.ink, fontSize: 13 }, input: { minHeight: 54, borderWidth: 1, borderColor: colors.line, borderRadius: 13, backgroundColor: colors.white, paddingHorizontal: 16, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, marginBottom: 8 },
  error: { fontFamily: fonts.regular, color: colors.red, fontSize: 14, lineHeight: 21 }, help: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 19, color: colors.muted, textAlign: 'center', marginTop: 4 }, footer: { flexDirection: 'row', justifyContent: 'center', gap: 8, alignItems: 'center' }, footerText: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
});
