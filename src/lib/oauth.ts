/**
 * Sign in with Google / Facebook through Supabase OAuth.
 *
 * Web: a normal redirect; Supabase reads the session from the URL when the app reloads
 * (`detectSessionInUrl` is on for web in src/lib/supabase.ts).
 * Native: opens an in-app browser and reads the tokens from the redirect URL.
 *
 * Each provider must be enabled in Supabase (Authentication → Sign In / Providers), and the
 * redirect URLs (the web origin and `paluwagan://`) added under Authentication → URL Configuration.
 */
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type OAuthProvider = 'google' | 'facebook';

const NAMES: Record<OAuthProvider, string> = { google: 'Google', facebook: 'Facebook' };

/** Ask the auth server which providers are turned on, so we can explain instead of failing. */
async function providerEnabled(p: OAuthProvider): Promise<boolean> {
  try {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    const json = (await res.json()) as { external?: Record<string, boolean> };
    return !!json.external?.[p];
  } catch {
    return true; // can't tell: let Supabase answer
  }
}

/** Starts the sign-in. Resolves when done (native) or right before the page redirects (web). */
export async function signInWithProvider(p: OAuthProvider): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Online sign-in isn’t set up yet. Continue offline for now.');
  if (!(await providerEnabled(p))) throw new Error(`${NAMES[p]} sign-in isn’t turned on yet. Use your email for now.`);

  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({ provider: p, options: { redirectTo: window.location.origin } });
    if (error) throw error;
    return;
  }

  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: p, options: { redirectTo, skipBrowserRedirect: true } });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return; // cancelled

  // Tokens come back in the URL fragment (implicit flow) or as a `code` (PKCE).
  const url = result.url;
  const params = new URLSearchParams((url.split('#')[1] ?? url.split('?')[1] ?? '').replace(/^\?/, ''));
  const err = params.get('error_description');
  if (err) throw new Error(err);
  const code = params.get('code');
  if (code) {
    const { error: e } = await supabase.auth.exchangeCodeForSession(code);
    if (e) throw e;
    return;
  }
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) throw new Error('Sign-in didn’t finish. Please try again.');
  const { error: e } = await supabase.auth.setSession({ access_token, refresh_token });
  if (e) throw e;
}
