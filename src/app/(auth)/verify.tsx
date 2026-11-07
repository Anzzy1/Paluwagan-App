import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/ui/Button';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useColors, useT } from '@/lib/prefs';
import { notify, notifyError } from '@/lib/alert';
import { supabase } from '@/lib/supabase';
import { font, radius } from '@/theme/tokens';

const LEN = 6;

export default function Verify() {
  const t = useT();
  const c = useColors();
  const { mode, target } = useLocalSearchParams<{ mode: 'email' | 'phone'; target: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  const verify = async (value = code) => {
    if (value.length !== LEN) return;
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp(
      mode === 'phone' ? { phone: target, token: value, type: 'sms' } : { email: target, token: value, type: 'email' },
    );
    setLoading(false);
    if (error) {
      haptic('warning');
      setCode('');
      return notifyError(error, 'Invalid code');
    }
    haptic('success');
  };

  const resend = async () => {
    const { error } = await supabase.auth.signInWithOtp(mode === 'phone' ? { phone: target } : { email: target });
    if (error) notifyError(error);
    else notify('Code sent', 'We sent you a new code.');
  };

  return (
    <AuthShell
      back
      title={t('auth.verify.title')}
      subtitle={`${t('auth.verify.subtitle')} ${target}`}
      footer={<Button title={t('auth.verify.cta')} onPress={() => verify()} disabled={code.length !== LEN} loading={loading} />}>
      <Pressable onPress={() => input.current?.focus()} style={styles.boxes}>
        {Array.from({ length: LEN }, (_, i) => {
          const active = i === code.length;
          return (
            <View
              key={i}
              style={[styles.box, { backgroundColor: c.surface, borderColor: active ? c.brand : c.border, borderWidth: active ? 2 : 1 }]}>
              <Text style={{ fontFamily: font.semibold, fontSize: 24 }}>{code[i] ?? ''}</Text>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={input}
        value={code}
        onChangeText={(v) => {
          const clean = v.replace(/\D/g, '').slice(0, LEN);
          setCode(clean);
          if (clean.length === LEN) verify(clean);
        }}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        autoFocus
        style={styles.hidden}
      />
      <PressableScale onPress={resend} hapticOnPress={false} style={{ alignSelf: 'flex-start' }}>
        <Text variant="smallBold" tone="brand">
          {t('auth.resend')}
        </Text>
      </PressableScale>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: 'row', gap: 8 },
  box: { flex: 1, height: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});
