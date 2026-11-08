/**
 * Local notices: notification-worthy moments that happen on this device
 * (a hulog day completed, an end-of-day reminder). They show in the Notifications
 * "Updates" list next to what other members did online. Stored on the device only.
 */
import type { Href } from 'expo-router';
import { useSyncExternalStore } from 'react';

import type { IconName } from '@/components/ui/bits';
import { kv } from '@/lib/storage';

export type Notice = {
  /** Stable id: pushing the same id again replaces the old notice instead of adding one. */
  id: string;
  at: string;
  tone: 'danger' | 'warning' | 'success' | 'info' | 'neutral' | 'brand';
  icon: IconName;
  text: string;
  circle: string;
  href: Href;
};

const KEY = 'local-notices-v1';
const MAX = 60;

function load(): Notice[] {
  try {
    const raw = kv.get(KEY);
    return raw ? (JSON.parse(raw) as Notice[]) : [];
  } catch {
    return [];
  }
}

let notices = load();
const listeners = new Set<() => void>();

export function pushNotice(n: Omit<Notice, 'at'>) {
  notices = [{ ...n, at: new Date().toISOString() }, ...notices.filter((x) => x.id !== n.id)].slice(0, MAX);
  kv.set(KEY, JSON.stringify(notices));
  listeners.forEach((l) => l());
}

export function hasNotice(id: string) {
  return notices.some((x) => x.id === id);
}

export function useNotices(): Notice[] {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => notices,
    () => notices,
  );
}
