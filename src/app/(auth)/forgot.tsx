import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { Input } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { notify, notifyError } from '@/lib/alert';
import { MIN_PASSWORD, RECOVERY_KEY, useAuth } from '@/lib/auth';
import { kv } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

const RESEND_SECONDS = 60;

/** Plain-language version of the auth server's errors. */
function friendly(e: { message: string }): Error {
  const m = e.message;
  if (/not authori[sz]ed/i.test(m)) return new Error('This email address can’t receive codes yet. The email service is still in test mode and only sends to the project team’s emails.');
  if (/rate limit|too many|security purposes/i.test(m)) return new Error('Too many emails were sent in a short time. Please wait a minute, then try again.');
  if (/sending|smtp|mail/i.test(m)) return new Error('The email service couldn’t send your code right now. Please try again in a few minutes.');
  if (/expired|invalid|otp|token/i.test(m)) return new Error('That code is wrong or has expired. Use the code from the newest email, or tap “Resend code”.');
  if (/same|different/i.test(m)) return new Error('That’s your current password. Pick a new one, or go back and log in with it.');
  if (/password/i.test(m) && /(short|weak|characters)/i.test(m)) return new Error(`Please use a stronger password (at least ${MIN_PASSWORD} characters).`);
  return new Error(m);
}

/**
 * Forgot password: type your email, get a code, set a new password.
 * The code signs you in (Supabase "recovery"), but you stay here until the new password is saved.
 */
export default function ForgotPassword() {
  const { setRecovering } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wait, setWait] = useState(0);
  /** The code was accepted (so a retry only needs to save the password). */
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  /** Code used but the new password not saved yet: leaving now signs them out again. */
  const unfinished = useRef(false);
  useEffect(
    () => () => {
      if (unfinished.current) {
        unfinished.current = false;
        kv.remove(RECOVERY_KEY);
        void supabase.auth.signOut({ scope: 'local' }).finally(() => setRecovering(false));
      } else {
        setRecovering(false);
      }
    },
    [setRecovering],
  );

  const target = email.trim().toLowerCase();
  const emailOk = /\S+@\S+\.\S+/.test(target);
  const codeOk = /^\d{6,8}$/.test(code);
  const mismatch = confirm.length > 0 && confirm !== password;
  const valid = (verified || codeOk) && password.length >= MIN_PASSWORD && confirm === password;

  const send = async () => {
    if (!emailOk || sending || wait > 0) return;
    setSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(target);
    setSending(false);
    if (error) return notifyError(friendly(error), 'Couldn’t send the code');
    setWait(RESEND_SECONDS);
    setStep('reset');
  };

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    if (!verified) {
      setRecovering(true); // keep them here once the code signs them in
      const { error } = await supabase.auth.verifyOtp({ email: target, token: code, type: 'recovery' });
      if (error) {
        setRecovering(false);
        setSaving(false);
        setCode('');
        haptic('warning');
        return notifyError(friendly(error), 'Code not accepted');
      }
      unfinished.current = true;
      kv.set(RECOVERY_KEY, '1');
      setVerified(true);
    }
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return notifyError(friendly(error), 'Couldn’t save password');
    unfinished.current = false;
    kv.remove(RECOVERY_KEY);
    haptic('success');
    notify('Password changed', 'You’re logged in. Next time, use your email and this new password.', 'success');
    setRecovering(false); // opens the app
  };

  if (step === 'email') {
    return (
      <AuthShell
        back
        title="Forgot your password?"
        subtitle="Type the email you use for your account. We’ll send you a code to set a new password."
        say="No worries, it happens! Let’s get you back in."
        mood="happy">
        <Input
          label="Email address"
          placeholder="you@company.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          returnKeyType="send"
          onSubmitEditing={send}
          autoFocus
        />
        <Button title={wait > 0 ? `Send again in ${wait}s` : 'Send code'} icon="send" onPress={send} disabled={!emailOk || wait > 0} loading={sending} />
        {wait > 0 && (
          <PressableScale onPress={() => setStep('reset')} hapticOnPress={false} style={{ alignSelf: 'center', paddingVertical: 4 }}>
            <Text variant="smallBold" tone="brand">
              I already have a code
            </Text>
          </PressableScale>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      back
      onBack={() => {
        if (verified) return router.back();
        setStep('email');
      }}
      title="Set a new password"
      subtitle={`Enter the code we sent to ${target}, then choose a new password.`}
      say="Check your inbox! The code expires soon, so be quick."
      mood="excited"
      footer={<Button title="Save new password" icon="lock" onPress={save} disabled={!valid} loading={saving} />}>
      {!verified && (
        <View style={{ gap: 6 }}>
          <Input
            label="Code from the email"
            placeholder="6-digit code"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 8))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={8}
            autoFocus
          />
          <PressableScale onPress={send} disabled={wait > 0 || sending} hapticOnPress={false} dimWhenDisabled={false} hitSlop={8} style={{ alignSelf: 'flex-end' }}>
            <Text variant="smallBold" tone={wait > 0 ? 'faint' : 'brand'}>
              {sending ? 'Sending…' : wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
            </Text>
          </PressableScale>
        </View>
      )}
      <PasswordInput
        label="New password"
        placeholder={`At least ${MIN_PASSWORD} characters`}
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        textContentType="newPassword"
        hint={password.length > 0 && password.length < MIN_PASSWORD ? `${MIN_PASSWORD - password.length} more characters` : undefined}
      />
      <PasswordInput
        label="Confirm new password"
        placeholder="Type it again"
        value={confirm}
        onChangeText={setConfirm}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={save}
        hint={mismatch ? 'Passwords don’t match yet' : undefined}
      />
      <Text variant="caption" tone="faint">
        Didn’t get it? Check your spam folder. The code only arrives if an account uses this email.
      </Text>
    </AuthShell>
  );
}
