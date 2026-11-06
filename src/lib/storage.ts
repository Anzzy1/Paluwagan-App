// expo-sqlite installs a synchronous, persistent `localStorage` global.
import 'expo-sqlite/localStorage/install';

export const kv = {
  get(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
};
