import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { haptic } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useColors, useT } from '@/lib/prefs';
import { errMsg, supabase } from '@/lib/supabase';
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
      return Alert.alert(t('common.error'), errMsg(error));
    }
    haptic('success');
    // Root layout's protected routes take over from here.
  };

  const resend = async () => {
    const { error } = await supabase.auth.signInWithOtp(mode === 'phone' ? { phone: target } : { email: target });
    Alert.alert(error ? t('common.error') : '📨', error ? errMsg(error) : 'Pinadala ulit ang code.');
  };

  return (
    <Screen
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
              style={[
                styles.box,
                { backgroundColor: c.surface, borderColor: active ? c.ink : c.border, borderWidth: active ? 2 : 1 },
              ]}>
              <Text style={{ fontFamily: font.extrabold, fontSize: 26 }}>{code[i] ?? ''}</Text>
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
      <Text variant="smallBold" tone="muted" center onPress={resend}>
        {t('auth.resend')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  box: { flex: 1, aspectRatio: 0.82, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});
