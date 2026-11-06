import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { Avatar, Input } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useUpdateProfile } from '@/lib/api';
import { useColors, useT } from '@/lib/prefs';
import { errMsg } from '@/lib/supabase';
import { avatarEmojis } from '@/theme/tokens';

export default function Setup() {
  const t = useT();
  const c = useColors();
  const [name, setName] = useState('');
  const [gcash, setGcash] = useState('');
  const [emoji, setEmoji] = useState(avatarEmojis[0]);
  const update = useUpdateProfile();

  const save = () =>
    update.mutate(
      { full_name: name.trim(), gcash_number: gcash.trim() || null, avatar_emoji: emoji },
      { onError: (e) => Alert.alert(t('common.error'), errMsg(e)) },
    );

  return (
    <Screen
      title={t('setup.title')}
      subtitle="Makikita ito ng mga ka-circle mo."
      footer={<Button title={t('setup.cta')} onPress={save} disabled={name.trim().length < 2} loading={update.isPending} />}>
      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <Avatar emoji={emoji} size={96} bg={c.accent} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {avatarEmojis.map((e) => (
          <PressableScale key={e} onPress={() => setEmoji(e)}>
            <Avatar emoji={e} size={48} ring={e === emoji ? c.ink : undefined} />
          </PressableScale>
        ))}
      </ScrollView>
      <Input label={t('setup.name')} placeholder="Juan Dela Cruz" value={name} onChangeText={setName} autoFocus />
      <Input
        label={t('setup.gcash')}
        placeholder="0917 123 4567"
        value={gcash}
        onChangeText={setGcash}
        keyboardType="phone-pad"
        hint="Optional — ipapakita sa mga magbabayad sa’yo kapag ikaw ang may sahod."
      />
      <Text variant="small" tone="faint" center>
        Puwede mo itong palitan anumang oras sa Profile.
      </Text>
    </Screen>
  );
}
