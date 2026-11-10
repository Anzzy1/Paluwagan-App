import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';

import { SocialButtons } from '@/components/auth/SocialButtons';
import { AuthShell } from '@/components/AuthShell';
import { Input } from '@/components/ui/bits';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PressableScale } from '@/components/ui/PressableScale';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { MIN_PASSWORD, useAuth } from '@/lib/auth';
import { notifyError } from '@/lib/alert';
import { supabase } from '@/lib/supabase';

/** Plain-language version of the auth server's "couldn't send" errors. */
function sendError(e: { message: string }): Error {
  const m = e.message;
  if (/not authori[sz]ed/i.test(m))
    return new Error('This email address can’t receive codes yet. The email service is still in test mode and only sends to the project team’s emails.');
  if (/rate limit|too many/i.test(m)) return new Error('Too many emails were sent in a short time. Please wait a while, then try again.');
  if (/sending|smtp|mail/i.test(m)) return new Error('The email service couldn’t send your code right now. Please try again in a few minutes.');
  return new Error(m);
}

/** Plain-language version of sign-up / log-in errors. */
function authError(e: { message: string }): Error {
  const m = e.message;
  if (/invalid login credentials/i.test(m)) return new Error('Wrong email or password. Forgot it? Tap “Forgot password?” to get a code and set a new one.');
  if (/email not confirmed/i.test(m)) return new Error('Please confirm your email first. Check your inbox for the code we sent when you signed up.');
  if (/already registered|already exists/i.test(m)) return new Error('This email already has an account. Log in instead.');
  if (/password/i.test(m) && /(short|weak|characters)/i.test(m)) return new Error(`Please use a stronger password (at least ${MIN_PASSWORD} characters).`);
  return sendError(e);
}

const redirect = () => (Platform.OS === 'web' ? window.location.origin : undefined);

export default function Login() {
  const { goOffline } = useAuth();
  const { mode: start } = useLocalSearchParams<{ mode?: 'signup' | 'login' }>();
  const signup = start === 'signup';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const target = email.trim().toLowerCase();
  const emailOk = /\S+@\S+\.\S+/.test(target);
  const mismatch = signup && confirm.length > 0 && confirm !== password;
  const valid = emailOk && (signup ? password.length >= MIN_PASSWORD && confirm === password : password.length > 0);

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    if (signup) {
      const { data, error } = await supabase.auth.signUp({ email: target, password, options: { emailRedirectTo: redirect() } });
      setLoading(false);
      if (error) return notifyError(authError(error), 'Couldn’t create account');
      // Supabase hides "already registered" by returning a user with no identities.
      if (data.user && data.user.identities?.length === 0) return notifyError(new Error('This email already has an account. Log in instead.'), 'Couldn’t create account');
      // With email confirmation on there's no session yet: confirm with the emailed code.
      if (!data.session) router.push({ pathname: '/verify', params: { mode: 'signup', target } });
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: target, password });
    setLoading(false);
    if (error) notifyError(authError(error), 'Couldn’t log in');
  };

  /** Forgot password: email → code → new password (also for accounts made before passwords existed). */
  const forgot = () => router.push({ pathname: '/forgot', params: emailOk ? { email: target } : {} });

  return (
    <AuthShell
      back
      title={signup ? 'Create your account' : 'Welcome back!'}
      subtitle={signup ? 'Use your email and pick a password you’ll remember.' : 'Log in with your email and password.'}
      say={signup ? 'Yay, a new member! This only takes a minute.' : 'Welcome back! I kept everything safe for you.'}
      mood="excited">
      <Input
        label="Email address"
        placeholder="you@company.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        textContentType={signup ? 'username' : 'emailAddress'}
        keyboardType="email-address"
        returnKeyType="next"
        autoFocus
      />
      <PasswordInput
        label="Password"
        placeholder={signup ? `At least ${MIN_PASSWORD} characters` : 'Your password'}
        value={password}
        onChangeText={setPassword}
        autoComplete={signup ? 'new-password' : 'current-password'}
        textContentType={signup ? 'newPassword' : 'password'}
        returnKeyType={signup ? 'next' : 'go'}
        onSubmitEditing={signup ? undefined : submit}
        hint={signup && password.length > 0 && password.length < MIN_PASSWORD ? `${MIN_PASSWORD - password.length} more characters` : undefined}
      />
      {signup && (
        <PasswordInput
          label="Confirm password"
          placeholder="Type it again"
          value={confirm}
          onChangeText={setConfirm}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
          hint={mismatch ? 'Passwords don’t match yet' : undefined}
        />
      )}
      <Button title={signup ? 'Create account' : 'Log in'} iconRight="arrow-right" onPress={submit} disabled={!valid} loading={loading} />
      {!signup && (
        <PressableScale onPress={forgot} hapticOnPress={false} style={{ alignSelf: 'center', paddingVertical: 4 }}>
          <Text variant="smallBold" tone="brand">
            Forgot password?
          </Text>
        </PressableScale>
      )}
      <PressableScale
        onPress={() => router.setParams({ mode: signup ? 'login' : 'signup' })}
        hapticOnPress={false}
        style={{ alignSelf: 'center', paddingVertical: 4 }}>
        <Text variant="smallBold" tone="muted">
          {signup ? 'Already have an account? ' : 'New here? '}
          <Text variant="smallBold" tone="brand">
            {signup ? 'Log in' : 'Create an account'}
          </Text>
        </Text>
      </PressableScale>
      <SocialButtons />
      <PressableScale onPress={goOffline} hapticOnPress={false} style={{ alignSelf: 'center', paddingVertical: 6 }}>
        <Text variant="smallBold" tone="muted">
          Not now?{' '}
          <Text variant="smallBold" tone="brand">
            Continue offline
          </Text>
        </Text>
      </PressableScale>
    </AuthShell>
  );
}
