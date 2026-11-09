import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Input, Notice } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PressableScale } from '@/components/ui/PressableScale';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { notify, notifyError } from '@/lib/alert';
import { MIN_PASSWORD, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const RESEND_SECONDS = 60;

function maskEmail(email: string) {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`;
}
const maskPhone = (phone: string) => `•••• ${phone.replace(/\D/g, '').slice(-4)}`;

/**
 * Set or change the signed-in user's password (also how code-only accounts get one).
 * Protected by re-authentication: Supabase sends a one-time code to the account's email (or phone)
 * and only accepts the new password together with that code, so an unlocked phone or a
 * forgotten logged-in laptop is not enough to take over the account.
 */
export function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session } = useAuth();
  const email = session?.user.email || '';
  const phone = session?.user.phone || '';
  const destination = email ? maskEmail(email) : phone ? maskPhone(phone) : 'your account';
  const via = email ? 'email' : 'phone';

  const [step, setStep] = useState<'verify' | 'password'>('verify');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const codeOk = /^\d{6,8}$/.test(code);
  const valid = codeOk && password.length >= MIN_PASSWORD && confirm === password;

  const close = () => {
    setStep('verify');
    setCode('');
    setPassword('');
    setConfirm('');
    onClose();
  };

  const sendCode = async () => {
    if (sending || wait > 0) return;
    setSending(true);
    const { error } = await supabase.auth.reauthenticate();
    setSending(false);
    if (error) return notifyError(error, 'Couldn’t send the code');
    setWait(RESEND_SECONDS);
    setStep('password');
  };

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password, nonce: code });
    setSaving(false);
    if (error) {
      if (/nonce|otp|token|expired|invalid/i.test(error.message)) return notifyError(new Error('That code is wrong or has expired. Check it, or send a new one.'), 'Couldn’t verify it’s you');
      if (/same|different/i.test(error.message)) return notifyError(new Error('That’s already your password. Pick a new one.'), 'Couldn’t save password');
      return notifyError(error, 'Couldn’t save password');
    }
    notify('Password saved', email ? 'Next time, log in with your email and this password.' : 'Your new password is saved.', 'success');
    close();
  };

  return (
    <Sheet open={open} onClose={close} title="Set password" subtitle={step === 'verify' ? 'First, confirm it’s really you.' : `Enter the code we sent to ${destination}.`}>
      {step === 'verify' ? (
        <>
          <Notice
            tone="info"
            icon="shield"
            title="Verify it’s you"
            body={`To keep your account safe, we’ll send a one-time code to your ${via} (${destination}). You’ll need it to set a new password.`}
          />
          <Button title={wait > 0 ? `Send again in ${wait}s` : 'Send code'} icon="send" onPress={sendCode} loading={sending} disabled={wait > 0} />
        </>
      ) : (
        <>
          <Input
            label="Verification code"
            placeholder="6-digit code"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 8))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={8}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: -4 }}>
            <PressableScale onPress={sendCode} disabled={wait > 0 || sending} hapticOnPress={false} dimWhenDisabled={false} hitSlop={8}>
              <Text variant="smallBold" tone={wait > 0 ? 'faint' : 'brand'}>
                {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
              </Text>
            </PressableScale>
          </View>
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
            label="Confirm password"
            placeholder="Type it again"
            value={confirm}
            onChangeText={setConfirm}
            autoComplete="new-password"
            textContentType="newPassword"
            onSubmitEditing={save}
            hint={confirm.length > 0 && confirm !== password ? 'Passwords don’t match yet' : undefined}
          />
          <Button title="Save password" icon="lock" onPress={save} disabled={!valid} loading={saving} />
        </>
      )}
    </Sheet>
  );
}
