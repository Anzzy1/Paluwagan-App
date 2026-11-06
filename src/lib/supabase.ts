import '@/lib/storage'; // installs the localStorage polyfill first

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';


const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export const isSupabaseConfigured = Boolean(url && key);

export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder', {
  auth: {
    storage: globalThis.localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Turn a PostgREST / RPC error into a readable message. */
export function errMsg(e: unknown): string {
  if (!e) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (typeof e === 'object' && e && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}
