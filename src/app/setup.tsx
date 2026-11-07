import { useState } from 'react';
import { View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { Avatar, Input } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useUpdateProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/prefs';
import { notifyError } from '@/lib/alert';

export default function Setup() {
  const t = useT();
  const { userId } = useAuth();
  const [name, setName] = useState('');
  const [gcash, setGcash] = useState('');
  const update = useUpdateProfile();

  const save = () =>
    update.mutate(
      { full_name: name.trim(), gcash_number: gcash.trim() || null },
      { onError: (e) => notifyError(e) },
    );

  return (
    <AuthShell
      title={t('setup.title')}
      subtitle="Members of your paluwagan will see this information."
      footer={<Button title={t('setup.cta')} onPress={save} disabled={name.trim().length < 2} loading={update.isPending} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar name={name || '?'} seed={userId ?? undefined} size={56} />
        <Text tone="muted" style={{ flex: 1 }}>
          Your initials are used as your avatar.
        </Text>
      </View>
      <Input label={t('setup.name')} placeholder="Juan Dela Cruz" value={name} onChangeText={setName} autoFocus />
      <Input
        label={t('setup.gcash')}
        placeholder="0917 123 4567"
        value={gcash}
        onChangeText={setGcash}
        keyboardType="phone-pad"
        hint="Optional. Shown to members who need to pay you when it’s your payout round."
      />
    </AuthShell>
  );
}
