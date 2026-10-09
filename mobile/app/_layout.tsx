import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { AuthProvider, useAuth } from '../lib/auth';
import { colors } from '../lib/theme';

export default function RootLayout() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  if (!loaded && !error) return <View style={{ flex: 1, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.ink} /></View>;
  if (error) return <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}><Text>Could not load the app fonts. Please restart Yavamo.</Text></View>;
  return <SafeAreaProvider><AuthProvider><StatusBar style="dark" />
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <Navigator />
    </SafeAreaView>
  </AuthProvider></SafeAreaProvider>;
}
function Navigator() {
  const { member } = useAuth();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
    <Stack.Screen name="index" />
    <Stack.Protected guard={!!member}><Stack.Screen name="account" /></Stack.Protected>
  </Stack>;
}
