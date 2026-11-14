import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { DEMO_USER_ID, demoQuery, demoState } from '@/lib/demo';
import { kv } from '@/lib/storage';
import { isNetworkError } from '@/lib/network';
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
  /**
   * True during "Forgot password": the reset code signs the user in, but they stay on the
   * reset screen until the new password is saved.
   */
  recovering: boolean;
  setRecovering: (on: boolean) => void;
  /** Start (or go back to) offline mode, with no account. */
  goOffline: () => void;
  /** Leave offline mode to log in or create an account. Offline paluwagan stay on this device. */
  exitOffline: () => void;
};

const OFFLINE_KEY = 'offline-mode-v1';
/** Last loaded profile, so a signed-in user can open the app without internet. */
const PROFILE_CACHE_KEY = 'profile-cache-v1';

function cachedProfile(userId: string): Profile | null {
  try {
    const p = JSON.parse(kv.get(PROFILE_CACHE_KEY) ?? 'null') as Profile | null;
    return p?.id === userId ? p : null;
  } catch {
    return null;
  }
}

/**
 * The login saved on this device, read straight from storage. Supabase's own getSession()
 * tries to renew an expired login first, and without internet that retries for up to a
 * minute and then reports "signed out". Reading it directly lets the app open at once.
 */
function savedSession(): Session | null {
  try {
    const key = (supabase.auth as unknown as { storageKey: string }).storageKey;
    const s = JSON.parse(kv.get(key) ?? 'null') as Session | null;
    return s?.user?.id && s.refresh_token ? s : null;
  } catch {
    return null;
  }
}

/** Couldn't reach the server (as opposed to the server saying the login is no longer valid). */
const isOfflineError = (e: unknown) => !!e && (isAuthRetryableFetchError(e) || isNetworkError(e));

/** Abort a request that hangs on a weak connection instead of waiting forever. */
function timeout(ms: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * People choose how to start: log in / create an account (email or phone code),
 * or continue offline with no account (managed paluwagan only, stored on the device).
 * Offline users can log in later from Profile or Settings.
 * Older automatic guest (anonymous) sessions keep working.
 */
/** Minimum password length for sign-up and password changes (Supabase's own minimum is 6). */
export const MIN_PASSWORD = 8;

/**
 * Set while a password reset code has been used but the new password isn't saved yet.
 * If the app closes in between, the next start signs out instead of opening the app.
 */
export const RECOVERY_KEY = 'password-reset-pending-v1';

export function AuthProvider({ children }: { children: ReactNode }) {
  // A finished login on this device opens the app straight away, even offline; the server check runs behind it.
  const [saved] = useState(() => (isSupabaseConfigured && kv.get(RECOVERY_KEY) !== '1' ? savedSession() : null));
  const [session, setSession] = useState<Session | null>(saved);
  const [initializing, setInitializing] = useState(isSupabaseConfigured && !saved);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [offline, setOffline] = useState(() => kv.get(OFFLINE_KEY) === '1');
  const [recovering, setRecovering] = useState(false);
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
      const res = await supabase.auth.getSession();
      let next = res.data.session;
      if (kv.get(RECOVERY_KEY) === '1') {
        // A reset that was never finished: the code signed them in, but no new password was set.
        kv.remove(RECOVERY_KEY);
        if (next) await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        next = null;
      } else if (!next && saved && isOfflineError(res.error)) {
        // No internet to renew the login: keep the saved one. Supabase renews it once back online.
        return finish(saved);
      }
      finish(next);
    })();
    function finish(s: Session | null) {
      if (cancelled) return;
      setSession(s);
      setInitializing(false);
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // The first event repeats getSession's answer, which can be "no session" just because
      // there's no internet. The startup check above handles it.
      if (event === 'INITIAL_SESSION') return;
      setSession(s);
      if (s) kv.set(OFFLINE_KEY, '0');
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [saved]);

  const userId = isDemo ? DEMO_USER_ID : (session?.user.id ?? null);

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    // Start from the profile saved on this device so the app opens at once; the fresh one loads behind it.
    initialData: () => (userId && !demoState.on ? (cachedProfile(userId) ?? undefined) : undefined),
    initialDataUpdatedAt: 0,
    retry: false,
    queryFn: async ({ queryKey }) => {
      if (demoState.on) return (await demoQuery(queryKey)) as Profile;
      // Recount the Trust Score first so missed hulog show up even before a round is released.
      // Best effort: ignored if it fails (e.g. before migration 0008 is run) or is slow.
      const t1 = timeout(5_000);
      await supabase
        .rpc('refresh_my_tiwala')
        .abortSignal(t1.signal)
        .then(
          () => undefined,
          () => undefined,
        );
      t1.done();
      const t2 = timeout(10_000);
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).abortSignal(t2.signal).maybeSingle();
      t2.done();
      if (error) {
        // No internet (or too slow): keep going with the last profile we saw on this device.
        if (isNetworkError(error) || t2.signal.aborted) {
          const cached = cachedProfile(userId!);
          if (cached) return cached;
        }
        throw error;
      }
      if (data) kv.set(PROFILE_CACHE_KEY, JSON.stringify(data));
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
    recovering,
    setRecovering,
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
