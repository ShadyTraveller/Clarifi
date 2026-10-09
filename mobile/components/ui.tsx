import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps, ReactNode } from 'react';
import { colors, fonts } from '../lib/theme';

export type IconName = ComponentProps<typeof Feather>['name'];
export function Icon({ name, color = colors.ink, size = 20 }: { name: IconName; color?: string; size?: number }) {
  return <Feather name={name} size={size} color={color} />;
}
export function Button({ label, onPress, busy = false, secondary = false, icon, disabled = false }: {
  label: string; onPress(): void; busy?: boolean; secondary?: boolean; icon?: IconName; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: busy || disabled, busy }}
    disabled={busy || disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary ? styles.secondary : styles.primary, (pressed || busy || disabled) && { opacity: 0.65 }]}>
    {busy ? <ActivityIndicator color={colors.ink} /> : icon ? <Icon name={icon} /> : null}
    <Text style={styles.buttonText}>{label}</Text>
  </Pressable>;
}
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function StateMessage({ title, detail, icon = 'inbox', error = false }: { title: string; detail: string; icon?: IconName; error?: boolean }) {
  return <View style={styles.state} accessibilityLiveRegion={error ? 'assertive' : 'polite'}>
    <View style={[styles.stateIcon, error && { backgroundColor: colors.redWash }]}><Icon name={icon} color={error ? colors.red : colors.muted} size={26} /></View>
    <Text style={styles.stateTitle}>{title}</Text><Text style={styles.stateDetail}>{detail}</Text>
  </View>;
}
export const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1, borderRadius: 20, padding: 20 },
  button: { minHeight: 52, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  primary: { backgroundColor: colors.yellow }, secondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  buttonText: { fontFamily: fonts.semibold, color: colors.ink, fontSize: 15, flexShrink: 1 },
  state: { alignItems: 'center', paddingVertical: 30, paddingHorizontal: 12, gap: 12 },
  stateIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  stateTitle: { fontFamily: fonts.semibold, fontSize: 18, color: colors.ink, textAlign: 'center' },
  stateDetail: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, color: colors.muted, textAlign: 'center', maxWidth: 340 },
});
