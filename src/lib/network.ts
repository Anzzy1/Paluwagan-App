/**
 * Is the internet (our backend) reachable right now?
 *
 * Web listens to the browser's online/offline events. Every platform also checks the
 * Supabase health endpoint now and then, because "connected to Wi-Fi" doesn't always
 * mean the internet works. No extra native module is needed.
 */
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const CHECK_EVERY_MS = 30_000;
const TIMEOUT_MS = 5_000;

let online = Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
const listeners = new Set<() => void>();
let started = false;

function set(next: boolean) {
  if (next === online) return;
  online = next;
  listeners.forEach((l) => l());
}

/** Ping the backend; network errors or timeouts mean offline. */
export async function checkConnection(): Promise<boolean> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false) {
    set(false);
    return false;
  }
  if (!URL) return online;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    await fetch(`${URL}/auth/v1/health`, { headers: { apikey: KEY }, signal: ctrl.signal, cache: 'no-store' });
    set(true); // any HTTP answer means the internet works
    return true;
  } catch {
    set(false);
    return false;
  } finally {
    clearTimeout(t);
  }
}

function start() {
  if (started) return;
  started = true;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('online', () => void checkConnection());
    window.addEventListener('offline', () => set(false));
  }
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void checkConnection();
  });
  void checkConnection();
  setInterval(() => void checkConnection(), CHECK_EVERY_MS);
}

const subscribe = (l: () => void) => {
  start();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Current connection state (re-renders when it changes). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => online, () => online);
}

/** Non-hook read, for code outside components. */
export const isOnline = () => online;

/** True for errors that mean "couldn't reach the server" rather than a real server error. */
export function isNetworkError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e ?? '');
  return /network|failed to fetch|failed to send a request|load failed|fetch failed|timed? ?out|abort/i.test(m);
}
