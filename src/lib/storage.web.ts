// Web: the browser already provides a persistent localStorage, so skip the
// expo-sqlite polyfill (which needs WASM + special headers on web).
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
