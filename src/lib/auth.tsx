import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { DEMO_USER_ID, demoQuery, demoState } from '@/lib/demo';
import { kv } from '@/lib/storage';
import { errMsg, isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

type AuthState = {
  session: Session | null;
  userId: string | null;
  initializing: boolean;
  profile: Profile | null;
  profileLoading: boolean;
  /** True while the app runs on an automatic guest (anonymous) account. */
  isGuest: boolean;
  /** Set when a guest account couldn't be created (e.g. anonymous sign-ins disabled). */
  guestError: string | null;
  refreshProfile: () => Promise<unknown>;
  signOut: () => Promise<void>;
  /** Discard the current guest and start over as a brand-new test user. */
  newGuest: () => Promise<void>;
  retryGuest: () => Promise<void>;
  isDemo: boolean;
  enterDemo: () => void;
  /** Using the app without an account: only managed (offline) paluwagan on this device. */
  isOffline: boolean;
  /** Start (or go back to) offline mode, with no account. */
  goOffline: () => void;
  /** Leave offline mode to log in or create an account. Offline paluwagan stay on this device. */
  exitOffline: () => void;
};

const OFFLINE_KEY = 'offline-mode-v1';

const AuthContext = createContext<AuthState | null>(null);

/**
 * People choose how to start: log in / create an account (email or phone code),
 * or continue offline with no account (managed paluwagan only, stored on the device).
 * Offline users can log in later from Profile or Settings.
 * Older automatic guest (anonymous) sessions keep working.
 */
/** Minimum password length for sign-up and password changes (Supabase's own minimum is 6). */
export const MIN_PASSWORD = 8;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(isSupabaseConfigured);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [offline, setOffline] = useState(() => kv.get(OFFLINE_KEY) === '1');
  const qc = useQueryClient();
  const saveOffline = (on: boolean) => {
    kv.set(OFFLINE_KEY, on ? '1' : '0');
    setOffline(on);
  };

  const startGuest = async () => {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) setGuestError(errMsg(error));
    else {
      setGuestError(null);
      setSession(data.session);
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    (async () => {
      // No automatic guest any more: without a session the user picks log in or offline.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      setInitializing(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) kv.set(OFFLINE_KEY, '0');
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = isDemo ? DEMO_USER_ID : (session?.user.id ?? null);

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async ({ queryKey }) => {
      if (demoState.on) return (await demoQuery(queryKey)) as Profile;
      // Recount the Trust Score first so missed hulog show up even before a round is released.
      // Best effort: ignored if it fails (e.g. before migration 0008 is run).
      await supabase.rpc('refresh_my_tiwala').then(
        () => undefined,
        () => undefined,
      );
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });

  // Give new guests a default display name (editable in Profile).
  const profile = profileQuery.data ?? null;
  const needsName = !isDemo && !!session?.user.is_anonymous && !!userId && profileQuery.isSuccess && !!profile && !profile.full_name;
  useEffect(() => {
    if (!needsName || !userId) return;
    supabase
      .from('profiles')
      .update({ full_name: `Guest ${userId.slice(-4).toUpperCase()}` })
      .eq('id', userId)
      .then(() => profileQuery.refetch());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsName, userId]);

  const demoSession = isDemo ? ({ user: { id: DEMO_USER_ID, email: 'demo@paluwagan.app' } } as unknown as Session) : null;

  const value: AuthState = {
    session: demoSession ?? session,
    userId,
    initializing,
    profile,
    profileLoading: !!userId && (profileQuery.isPending || needsName),
    isGuest: !isDemo && !!session?.user.is_anonymous,
    guestError,
    refreshProfile: () => profileQuery.refetch(),
    signOut: async () => {
      if (isDemo) {
        demoState.on = false;
        setIsDemo(false);
      } else {
        await supabase.auth.signOut();
      }
      qc.clear();
    },
    newGuest: async () => {
      demoState.on = false;
      setIsDemo(false);
      await supabase.auth.signOut();
      qc.clear();
      await startGuest();
    },
    retryGuest: startGuest,
    isDemo,
    enterDemo: () => {
      demoState.on = true;
      qc.clear();
      setIsDemo(true);
    },
    isOffline: offline && !session && !isDemo,
    goOffline: () => saveOffline(true),
    exitOffline: () => {
      demoState.on = false;
      setIsDemo(false);
      saveOffline(false);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
