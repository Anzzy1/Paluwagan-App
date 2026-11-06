import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { strings, type Lang, type StringKey } from '@/i18n/strings';
import { kv } from '@/lib/storage';
import { palette, type Colors } from '@/theme/tokens';

export type ThemePref = 'system' | 'light' | 'dark';

type Prefs = {
  lang: Lang;
  setLang: (l: Lang) => void;
  themePref: ThemePref;
  setThemePref: (t: ThemePref) => void;
  onboarded: boolean;
  setOnboarded: (v: boolean) => void;
};

const PrefsContext = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (kv.get('lang') as Lang) || 'fil');
  const [themePref, setThemeState] = useState<ThemePref>(() => (kv.get('theme') as ThemePref) || 'system');
  const [onboarded, setOnbState] = useState(() => kv.get('onboarded') === '1');

  const setLang = useCallback((l: Lang) => {
    kv.set('lang', l);
    setLangState(l);
  }, []);
  const setThemePref = useCallback((t: ThemePref) => {
    kv.set('theme', t);
    setThemeState(t);
  }, []);
  const setOnboarded = useCallback((v: boolean) => {
    kv.set('onboarded', v ? '1' : '0');
    setOnbState(v);
  }, []);

  const value = useMemo(
    () => ({ lang, setLang, themePref, setThemePref, onboarded, setOnboarded }),
    [lang, setLang, themePref, setThemePref, onboarded, setOnboarded],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used within PrefsProvider');
  return ctx;
}

export function useT() {
  const { lang } = usePrefs();
  return useCallback((key: StringKey) => strings[lang][key] ?? key, [lang]);
}

export function useIsDark() {
  const system = useColorScheme();
  const { themePref } = usePrefs();
  return themePref === 'system' ? system === 'dark' : themePref === 'dark';
}

export function useColors(): Colors {
  return useIsDark() ? palette.dark : palette.light;
}
