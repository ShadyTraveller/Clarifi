import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Icon, type IconName } from './ui';
import { useAuth } from '../lib/auth';
import { colors, fonts } from '../lib/theme';

const destinations = [
  { path: '/' as const, label: 'Home', icon: 'home' as IconName },
  { path: '/schedule' as const, label: 'Schedule', icon: 'calendar' as IconName },
  { path: '/work' as const, label: 'Work', icon: 'briefcase' as IconName },
  { path: '/account' as const, label: 'Account', icon: 'user' as IconName },
];
export function AppShell({ children }: { children: ReactNode }) {
  const { member } = useAuth();
  const path = usePathname();
  const { width } = useWindowDimensions();
  const wide = width >= 840;
  const active = path.startsWith('/jobs/') ? '/work' : path;
  return <View style={s.shell}>
    {member && <View style={s.command}>
      <View style={s.brandRow}><View style={s.mark}><Text style={s.letter}>y</Text></View><View style={s.identity}>
        <Text style={s.brand}>yavamo</Text><Text style={s.workspace} numberOfLines={1}>{member?.organizationName}</Text>
      </View></View>
      {width >= 600 && <View style={s.team}><View style={s.teamDot} /><Text style={s.teamText}>{member?.role === 'technician' ? 'Field workspace' : 'Dispatch workspace'}</Text></View>}
      <Pressable accessibilityRole="button" accessibilityLabel="Account and workspace" onPress={() => router.dismissTo('/account')}
        style={({ pressed }) => [s.profile, pressed && s.pressed]}><Icon name="user" color={colors.white} size={20} /></Pressable>
    </View>}
    <View style={s.body}>
      {member && wide && <View style={s.rail}><Text style={s.railLabel}>WORKSPACE</Text><Navigation active={active} wide />
        <View style={s.railFooter}><Icon name="sun" size={18} color={colors.muted} /><Text style={s.railNote}>Good work. Less busywork.</Text></View>
      </View>}
      <View style={s.content}>{children}</View>
    </View>
    {member && !wide && <View style={s.bottom}><Navigation active={active} wide={false} /></View>}
  </View>;
}
function Navigation({ active, wide }: { active: string; wide: boolean }) {
  return <View accessibilityRole="tablist" style={wide ? s.railLinks : s.tabs}>{destinations.map(item => {
    const selected = active === item.path;
    return <Pressable key={item.path} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected }} aria-selected={selected}
      onPress={() => router.dismissTo(item.path)} style={({ pressed }) => [wide ? s.railItem : s.tab, selected && wide && s.railSelected, pressed && s.pressed]}>
      <View style={[s.icon, selected && !wide && s.selectedIcon]}><Icon name={item.icon} color={selected ? colors.ink : colors.muted} size={21} /></View>
      <Text style={[s.label, wide && s.railText, selected && s.selectedLabel]}>{item.label}</Text>
    </Pressable>;
  })}</View>;
}
const s = StyleSheet.create({
  shell: { flex: 1 }, command: { backgroundColor: colors.ink, minHeight: 80, paddingHorizontal: 22, paddingVertical: 12, flexDirection: 'row', gap: 20, alignItems: 'center' },
  brandRow: { flexDirection: 'row', gap: 11, alignItems: 'center', flex: 1, minWidth: 0 }, identity: { flex: 1 }, mark: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' }, letter: { fontFamily: fonts.bold, fontSize: 29, color: colors.ink },
  brand: { fontFamily: fonts.bold, color: colors.white, fontSize: 23, letterSpacing: -0.8 }, workspace: { fontFamily: fonts.regular, color: '#B5B5AC', fontSize: 11, marginTop: 3 },
  profile: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: '#40403B', alignItems: 'center', justifyContent: 'center' }, team: { flexDirection: 'row', alignItems: 'center', gap: 8 }, teamDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.yellow }, teamText: { fontFamily: fonts.medium, fontSize: 12, color: '#D3D3CA' },
  body: { flex: 1, flexDirection: 'row' }, content: { flex: 1, minWidth: 0 }, rail: { width: 208, backgroundColor: colors.paper, borderRightWidth: 1, borderColor: colors.line, padding: 16 }, railLabel: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 1.5, margin: 12, marginBottom: 24 }, railLinks: { gap: 8 }, railItem: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderRadius: 28, paddingHorizontal: 14 }, railSelected: { backgroundColor: colors.yellow }, railText: { fontSize: 14 },
  railFooter: { marginTop: 'auto', padding: 12, gap: 12 }, railNote: { fontFamily: fonts.regular, color: colors.muted, fontSize: 12, lineHeight: 19 },
  bottom: { backgroundColor: colors.white, borderTopWidth: 1, borderColor: colors.line, paddingHorizontal: 8, paddingVertical: 8 }, tabs: { flexDirection: 'row' }, tab: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 4 }, icon: { minWidth: 52, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 20 }, selectedIcon: { backgroundColor: colors.yellow }, label: { fontFamily: fonts.medium, color: colors.muted, fontSize: 11 }, selectedLabel: { color: colors.ink, fontFamily: fonts.semibold }, pressed: { opacity: 0.65 },
});
