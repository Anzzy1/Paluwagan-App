import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/ui/Button';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useColors, useT } from '@/lib/prefs';
import { notify, notifyError } from '@/lib/alert';
import { supabase } from '@/lib/supabase';
import { font, radius } from '@/theme/tokens';

// Must match "Email OTP Length" in Supabase (Authentication → Sign In / Providers → Email).
const LEN = 6;

/** Plain-language version of the auth server's code errors. */
function codeError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/expired|invalid/i.test(msg)) return new Error('That code is wrong or has expired. Use the code from the newest email, or tap “Resend code”.');
  if (/rate|too many/i.test(msg)) return new Error('Too many tries. Please wait a minute, then try again.');
  return e instanceof Error ? e : new Error(msg);
}

export default function Verify() {
  const t = useT();
  const c = useColors();
  const { mode, target } = useLocalSearchParams<{ mode: 'email' | 'phone' | 'signup'; target: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  // Email providers limit how often codes can be sent, so resend unlocks after a short wait.
  const [wait, setWait] = useState(60);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  const verify = async (value = code) => {
    if (value.length < LEN || loading) return;
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp(
      mode === 'phone' ? { phone: target, token: value, type: 'sms' } : { email: target, token: value, type: mode === 'signup' ? 'signup' : 'email' },
    );
    setLoading(false);
    if (error) {
      haptic('warning');
      setCode('');
      return notifyError(codeError(error), 'Code not accepted');
    }
    haptic('success');
  };

  const resend = async () => {
    if (wait > 0) return;
    setWait(60);
    const emailRedirectTo = Platform.OS === 'web' ? window.location.origin : undefined;
    const { error } =
      mode === 'signup'
        ? await supabase.auth.resend({ type: 'signup', email: target, options: { emailRedirectTo } })
        : await supabase.auth.signInWithOtp(mode === 'phone' ? { phone: target } : { email: target, options: { emailRedirectTo } });
    if (error) notifyError(error);
    else notify('Code sent', 'We sent you a new code.', 'success');
  };

  return (
    <AuthShell
      back
      title={mode === 'signup' ? 'Confirm your email' : t('auth.verify.title')}
      subtitle={`${t('auth.verify.subtitle')} ${target}.${mode === 'email' ? ' Got a link instead of a code? Tap the link in the email to log in.' : ''}`}
      say="Check your inbox! The code expires soon, so be quick."
      footer={<Button title={t('auth.verify.cta')} onPress={() => verify()} disabled={code.length < LEN} loading={loading} />}>
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
          const next = v.replace(/\D/g, '').slice(0, LEN);
          setCode(next);
          if (next.length === LEN) verify(next); // auto-submit once all 6 digits are in
        }}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        autoFocus
        style={styles.hidden}
      />
      <PressableScale onPress={resend} disabled={wait > 0} hapticOnPress={false} style={{ alignSelf: 'flex-start' }}>
        <Text variant="smallBold" tone="brand">
          {wait > 0 ? `Resend code in ${wait}s` : t('auth.resend')}
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
