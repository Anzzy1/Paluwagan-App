import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';

import { strings, type StringKey } from '@/i18n/strings';
import { kv } from '@/lib/storage';
import { DESKTOP_BREAKPOINT, palette, type Colors } from '@/theme/tokens';

export type ThemePref = 'system' | 'light' | 'dark';

type Prefs = {
  themePref: ThemePref;
  setThemePref: (t: ThemePref) => void;
  onboarded: boolean;
  setOnboarded: (v: boolean) => void;
};

const PrefsContext = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [themePref, setThemeState] = useState<ThemePref>(() => (kv.get('theme') as ThemePref) || 'system');
  const [onboarded, setOnbState] = useState(() => kv.get('onboarded') === '1');

  const setThemePref = useCallback((t: ThemePref) => {
    kv.set('theme', t);
    setThemeState(t);
  }, []);
  const setOnboarded = useCallback((v: boolean) => {
    kv.set('onboarded', v ? '1' : '0');
    setOnbState(v);
  }, []);

  const value = useMemo(
    () => ({ themePref, setThemePref, onboarded, setOnboarded }),
    [themePref, setThemePref, onboarded, setOnboarded],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used within PrefsProvider');
  return ctx;
}

export function useT() {
  return useCallback((key: StringKey) => strings[key] ?? key, []);
}

export function useIsDark() {
  const system = useColorScheme();
  const { themePref } = usePrefs();
  return themePref === 'system' ? system === 'dark' : themePref === 'dark';
}

export function useColors(): Colors {
  return useIsDark() ? palette.dark : palette.light;
}

/** True on laptop/desktop-width screens (web). */
export function useIsDesktop() {
  const { width } = useWindowDimensions();
  return width >= DESKTOP_BREAKPOINT;
}
