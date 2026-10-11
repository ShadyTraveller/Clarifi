import 'react-native-url-polyfill/auto';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createChunkStorage } from './chunk-storage';
import { validatePublicConfig } from './config';

// Browser preview deliberately keeps sessions in memory; native uses SecureStore.
const previewMemory = new Map<string, string>();
const webStorage = {
  getItem: async (key: string) => previewMemory.get(key) ?? null,
  setItem: async (key: string, value: string) => { previewMemory.set(key, value); },
  removeItem: async (key: string) => { previewMemory.delete(key); },
};
let instance: SupabaseClient | undefined;
export function getSupabase() {
  if (instance) return instance;
  const { url, key } = validatePublicConfig(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  );
  instance = createClient(url, key, { auth: {
    storage: Platform.OS === 'web' ? webStorage : createChunkStorage(SecureStore),
    persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, lock: processLock,
  } });
  return instance;
}
