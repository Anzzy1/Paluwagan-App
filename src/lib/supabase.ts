import '@/lib/storage'; // installs the localStorage polyfill first

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';


const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export const isSupabaseConfigured = Boolean(url && key);

/**
 * fetch with a time limit. On Android a request on a weak signal can otherwise hang with no
 * end, leaving screens loading forever. Uploads (receipt photos) get longer.
 */
const fetchWithTimeout: typeof fetch = (input, init = {}) => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init.method ?? 'GET').toUpperCase();
  const ms = /\/storage\/v1\/object/.test(href) && method !== 'GET' ? 120_000 : /\/functions\/v1\//.test(href) ? 60_000 : 20_000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const outer = init.signal;
  if (outer) {
    if (outer.aborted) ctrl.abort();
    else outer.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
};

export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder', {
  global: { fetch: fetchWithTimeout },
  auth: {
    storage: globalThis.localStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Web: pick up the session from the URL after a Google / Facebook redirect.
    detectSessionInUrl: Platform.OS === 'web',
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
  const raw = typeof e === 'string' ? e : typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  // Database messages still say "circle"; the app calls it a paluwagan.
  return raw.replace(/\b([Cc])ircles?\b/g, (_m, c: string) => (c === 'C' ? 'Paluwagan' : 'paluwagan'));
}
