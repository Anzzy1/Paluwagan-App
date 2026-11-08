import { FontAwesome5 } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { notifyError } from '@/lib/alert';
import { signInWithProvider, type OAuthProvider } from '@/lib/oauth';
import { useColors } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <Path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <Path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <Path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </Svg>
  );
}

function SocialButton({ icon, label, onPress, busy }: { icon: ReactNode; label: string; onPress: () => void; busy: boolean }) {
  const c = useColors();
  return (
    <PressableScale onPress={onPress} disabled={busy} style={[styles.btn, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityLabel={`Continue with ${label}`}>
      {busy ? <ActivityIndicator size="small" color={c.textMuted} /> : icon}
      <Text variant="bodyBold">{label}</Text>
    </PressableScale>
  );
}

/** "or continue with" divider + Google and Facebook buttons. */
export function SocialButtons() {
  const c = useColors();
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const go = async (p: OAuthProvider) => {
    setBusy(p);
    try {
      await signInWithProvider(p);
    } catch (e) {
      notifyError(e, 'Couldn’t sign in');
    } finally {
      setBusy(null);
    }
  };
  return (
    <View style={{ gap: 14 }}>
      <View style={styles.divider}>
        <View style={[styles.line, { backgroundColor: c.border }]} />
        <Text variant="caption" tone="faint">
          or continue with
        </Text>
        <View style={[styles.line, { backgroundColor: c.border }]} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <SocialButton icon={<GoogleG />} label="Google" busy={busy === 'google'} onPress={() => go('google')} />
        <SocialButton icon={<FontAwesome5 name="facebook" size={20} color="#1877F2" />} label="Facebook" busy={busy === 'facebook'} onPress={() => go('facebook')} />
      </View>
      <Text variant="caption" tone="faint" center>
        We only use your name and email to set up your account. We never post anything.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flex: 1, height: 1 },
  btn: { flex: 1, height: 54, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
});
