import { useState } from 'react';

import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { notify, notifyError } from '@/lib/alert';
import { MIN_PASSWORD } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/** Set or change the signed-in user's password (also how code-only accounts get one). */
export function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const valid = password.length >= MIN_PASSWORD && confirm === password;

  const close = () => {
    setPassword('');
    setConfirm('');
    onClose();
  };

  const save = async () => {
    if (!valid || loading) return;
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return notifyError(/same|different/i.test(error.message) ? new Error('That’s already your password. Pick a new one.') : error, 'Couldn’t save password');
    notify('Password saved', 'Next time, log in with your email and this password.', 'success');
    close();
  };

  return (
    <Sheet open={open} onClose={close} title="Set password" subtitle="Log in with your email and this password from now on.">
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
      <Button title="Save password" onPress={save} disabled={!valid} loading={loading} />
    </Sheet>
  );
}
