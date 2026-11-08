import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { Divider, Input, Segmented } from '@/components/ui/bits';
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
  const { enterDemo, goOffline } = useAuth();
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
      <Button title={t('auth.send')} onPress={send} disabled={!valid} loading={loading} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 }}>
        <View style={{ flex: 1 }}>
          <Divider />
        </View>
        <Text variant="caption" tone="faint">
          OR
        </Text>
        <View style={{ flex: 1 }}>
          <Divider />
        </View>
      </View>
      <Button title="Continue offline" variant="secondary" icon="smartphone" onPress={goOffline} />
      <Text variant="caption" tone="faint" center>
        No account needed. Run paluwagan on this device only. Online paluwagan, Ipon goals and Ask Ipon need an account, and you can log in anytime from Profile.
      </Text>
      <Button title="Explore the demo" variant="ghost" icon="eye" onPress={enterDemo} />
    </>
  );

  return (
    <AuthShell title={t('auth.title')} subtitle={t('auth.subtitle')} footer={actions}>
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
