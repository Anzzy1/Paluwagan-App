import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { DEMO_USER_ID, demoQuery, demoState } from '@/lib/demo';
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
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * Sign-in is deferred for now: the app starts on an automatic guest account
 * (Supabase anonymous sign-in) so every feature can be tested immediately.
 * Email / phone login can later upgrade a guest via `supabase.auth.updateUser`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(isSupabaseConfigured);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const qc = useQueryClient();

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
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        const res = await supabase.auth.signInAnonymously();
        if (cancelled) return;
        if (res.error) setGuestError(errMsg(res.error));
        else setSession(res.data.session);
      } else if (!cancelled) {
        setSession(data.session);
      }
      if (!cancelled) setInitializing(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
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
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });

  // Give new guests a default display name (editable in Profile).
  const profile = profileQuery.data ?? null;
  const needsName = !isDemo && !!userId && profileQuery.isSuccess && !!profile && !profile.full_name;
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
