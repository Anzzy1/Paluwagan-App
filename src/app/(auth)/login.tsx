import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AuthShell } from '@/components/AuthShell';
import { Input, Segmented } from '@/components/ui/bits';
import { PressableScale } from '@/components/ui/PressableScale';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/prefs';
import { notifyError } from '@/lib/alert';
import { supabase } from '@/lib/supabase';

/** Normalises PH mobile numbers to E.164 (+639XXXXXXXXX). */
function toE164(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (d.startsWith('63')) return '+' + d;
  if (d.startsWith('0')) return '+63' + d.slice(1);
  if (d.startsWith('9')) return '+63' + d;
  return '+' + d;
}

export default function Login() {
  const t = useT();
  const { goOffline } = useAuth();
  const { mode: start } = useLocalSearchParams<{ mode?: 'signup' | 'login' }>();
  const signup = start === 'signup';
  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  const valid = mode === 'email' ? /\S+@\S+\.\S+/.test(value) : value.replace(/\D/g, '').length >= 10;

  const send = async () => {
    if (!valid) return;
    setLoading(true);
    const target = mode === 'email' ? value.trim().toLowerCase() : toE164(value);
    const { error } = await supabase.auth.signInWithOtp(
      mode === 'email' ? { email: target, options: { shouldCreateUser: true } } : { phone: target },
    );
    setLoading(false);
    if (error) return notifyError(error, 'Couldn’t send code');
    router.push({ pathname: '/verify', params: { mode, target } });
  };

  const actions = (
    <>
      <Button title={t('auth.send')} iconRight="arrow-right" onPress={send} disabled={!valid} loading={loading} />
      <PressableScale onPress={goOffline} hapticOnPress={false} style={{ alignSelf: 'center', paddingVertical: 6 }}>
        <Text variant="smallBold" tone="muted">
          Not now? <Text variant="smallBold" tone="brand">Continue offline</Text>
        </Text>
      </PressableScale>
    </>
  );

  return (
    <AuthShell
      back
      title={signup ? 'Create your account' : start === 'login' ? 'Welcome back!' : t('auth.title')}
      subtitle={signup ? 'Enter your email and we’ll send a 6-digit code. No password to remember.' : 'Enter the email or number you signed up with and we’ll send you a code.'}
      say={signup ? 'Yay, a new member! This only takes a minute.' : start === 'login' ? 'Welcome back! I kept everything safe for you.' : 'Log in, or create a free account with the same code.'}
      mood="excited"
      footer={actions}>
      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m);
          setValue('');
        }}
        options={[
          { value: 'email', label: t('auth.email') },
          { value: 'phone', label: t('auth.phone') },
        ]}
      />
      {mode === 'email' ? (
        <Input
          label="Email address"
          placeholder="you@company.com"
          value={value}
          onChangeText={setValue}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onSubmitEditing={send}
          autoFocus
        />
      ) : (
        <Input
          label="Mobile number"
          placeholder="917 123 4567"
          prefix="+63"
          value={value}
          onChangeText={setValue}
          keyboardType="phone-pad"
          autoComplete="tel"
          onSubmitEditing={send}
          hint="Phone sign-in requires an SMS provider to be configured in Supabase."
          autoFocus
        />
      )}
    </AuthShell>
  );
}
