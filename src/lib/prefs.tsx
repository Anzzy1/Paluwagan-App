import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';

import { strings, type StringKey } from '@/i18n/strings';
import { kv } from '@/lib/storage';
import { DESKTOP_BREAKPOINT, palette, type Colors } from '@/theme/tokens';

export type ThemePref = 'system' | 'light' | 'dark';

/** On/off device settings, stored in kv as '1'/'0'. */
export type Toggles = { hideAmounts: boolean; haptics: boolean; celebrations: boolean; mascotTips: boolean; push: boolean; sounds: boolean };
const TOGGLE_DEFAULTS: Toggles = { hideAmounts: false, haptics: true, celebrations: true, mascotTips: true, push: true, sounds: true };

function readToggles(): Toggles {
  const out = { ...TOGGLE_DEFAULTS };
  for (const k of Object.keys(out) as (keyof Toggles)[]) {
    const v = kv.get(`pref.${k}`);
    if (v !== null) out[k] = v === '1';
  }
  return out;
}

/** Live copy for plain functions (peso, haptic) that can't use hooks. Updated by the provider. */
export const settings: Toggles = readToggles();

type Prefs = {
  themePref: ThemePref;
  setThemePref: (t: ThemePref) => void;
  onboarded: boolean;
  setOnboarded: (v: boolean) => void;
  toggles: Toggles;
  setToggle: (k: keyof Toggles, v: boolean) => void;
};

const PrefsContext = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [themePref, setThemeState] = useState<ThemePref>(() => (kv.get('theme') as ThemePref) || 'system');
  const [onboarded, setOnbState] = useState(() => kv.get('onboarded') === '1');
  const [toggles, setToggles] = useState<Toggles>(() => ({ ...settings }));

  const setThemePref = useCallback((t: ThemePref) => {
    kv.set('theme', t);
    setThemeState(t);
  }, []);
  const setOnboarded = useCallback((v: boolean) => {
    kv.set('onboarded', v ? '1' : '0');
    setOnbState(v);
  }, []);

  const setToggle = useCallback((k: keyof Toggles, v: boolean) => {
    kv.set(`pref.${k}`, v ? '1' : '0');
    settings[k] = v;
    setToggles((t) => ({ ...t, [k]: v }));
  }, []);

  const value = useMemo(
    () => ({ themePref, setThemePref, onboarded, setOnboarded, toggles, setToggle }),
    [themePref, setThemePref, onboarded, setOnboarded, toggles, setToggle],
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
