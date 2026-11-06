import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input, Segmented } from '@/components/ui/bits';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useT } from '@/lib/prefs';
import { errMsg, supabase } from '@/lib/supabase';

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
  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  const valid = mode === 'email' ? /\S+@\S+\.\S+/.test(value) : value.replace(/\D/g, '').length >= 10;

  const send = async () => {
    setLoading(true);
    const target = mode === 'email' ? value.trim().toLowerCase() : toE164(value);
    const { error } = await supabase.auth.signInWithOtp(
      mode === 'email' ? { email: target, options: { shouldCreateUser: true } } : { phone: target },
    );
    setLoading(false);
    if (error) return Alert.alert(t('common.error'), errMsg(error));
    router.push({ pathname: '/verify', params: { mode, target } });
  };

  return (
    <Screen
      back
      title={t('auth.title')}
      subtitle={t('auth.subtitle')}
      footer={<Button title={t('auth.send')} onPress={send} disabled={!valid} loading={loading} icon="send" />}>
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
          label={t('auth.email')}
          placeholder="juan@email.com"
          value={value}
          onChangeText={setValue}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          autoFocus
        />
      ) : (
        <View style={{ gap: 6 }}>
          <Input
            label={t('auth.phone')}
            placeholder="0917 123 4567"
            value={value}
            onChangeText={setValue}
            keyboardType="phone-pad"
            autoComplete="tel"
            autoFocus
          />
          <Text variant="small" tone="faint">
            Kailangan ng SMS provider (hal. Twilio) sa Supabase para gumana ang phone login.
          </Text>
        </View>
      )}
    </Screen>
  );
}
