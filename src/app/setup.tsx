import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { AuthShell } from '@/components/AuthShell';
import { WelcomeMoment } from '@/components/auth/WelcomeMoment';
import { Avatar, Input } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useSetAvatar, useUpdateProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { notifyError } from '@/lib/alert';
import { pickPhoto, type Photo } from '@/lib/photo';
import { useColors, useT } from '@/lib/prefs';

type Step = 'name' | 'photo' | 'welcome';

function StepTag({ n }: { n: number }) {
  return (
    <Text variant="smallBold" tone="brand">
      Step {n} of 2
    </Text>
  );
}

/**
 * First-time setup: your name (required), an optional profile photo, then a short welcome
 * from Ipon. The name is saved last, because saving it is what opens the app.
 */
export default function Setup() {
  const t = useT();
  const c = useColors();
  const { userId } = useAuth();
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [gcash, setGcash] = useState('');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const update = useUpdateProfile();
  const setAvatar = useSetAvatar();

  const choose = async (camera: boolean) => {
    const p = await pickPhoto(camera);
    if (p) setPhoto(p);
  };

  // Upload the photo (if any) while Ipon says hello. A failed upload shouldn't block sign-up.
  const toWelcome = (withPhoto: boolean) => {
    setStep('welcome');
    if (withPhoto && photo) setAvatar.mutate(photo, { onError: (e) => notifyError(e, 'Couldn’t upload photo. You can add one later in Profile.') });
    else setPhoto(null);
  };

  const finish = () =>
    update.mutate({ full_name: name.trim(), gcash_number: gcash.trim() || null }, { onError: (e) => notifyError(e) });

  if (step === 'welcome') {
    return <WelcomeMoment name={name} seed={userId ?? undefined} photo={photo?.uri} onDone={finish} loading={update.isPending || setAvatar.isPending} />;
  }

  if (step === 'photo') {
    const first = name.trim().split(/\s+/)[0];
    return (
      <AuthShell
        back
        onBack={() => setStep('name')}
        title="Add a profile photo"
        subtitle="Optional. A photo helps your paluwagan members recognize you. You can change it anytime in Profile."
        say={`Nice to meet you, ${first}! Want to show your face?`}
        mood="excited"
        footer={
          <>
            <Button title="Continue" iconRight="arrow-right" onPress={() => toWelcome(true)} disabled={!photo} />
            <Button title="Skip for now" variant="ghost" onPress={() => toWelcome(false)} />
          </>
        }>
        <StepTag n={2} />
        <View style={{ alignItems: 'center', gap: 16 }}>
          <PressableScale onPress={() => choose(false)} accessibilityLabel="Choose a photo" style={{ alignItems: 'center' }}>
            {photo ? (
              <Animated.View key={photo.uri} entering={ZoomIn.springify().damping(12)}>
                <Avatar name={name} seed={userId ?? undefined} uri={photo.uri} size={132} ring={c.brand} />
              </Animated.View>
            ) : (
              <View style={[styles.empty, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
                <Feather name="camera" size={34} color={c.textFaint} />
              </View>
            )}
            <View style={[styles.badge, { backgroundColor: c.brand, borderColor: c.bg }]}>
              <Feather name={photo ? 'edit-2' : 'plus'} size={16} color={c.onBrand} />
            </View>
          </PressableScale>
          <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
            <Button title={photo ? 'Choose another' : 'Choose a photo'} icon="image" variant="secondary" size="md" onPress={() => choose(false)} style={{ flex: 1 }} />
            {Platform.OS !== 'web' && <Button title="Take a photo" icon="camera" variant="secondary" size="md" onPress={() => choose(true)} style={{ flex: 1 }} />}
          </View>
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t('setup.title')}
      subtitle="Members of your paluwagan will see this information."
      say="You’re in! What should I call you?"
      mood="excited"
      footer={<Button title={t('setup.cta')} iconRight="arrow-right" onPress={() => setStep('photo')} disabled={name.trim().length < 2} />}>
      <StepTag n={1} />
      <Animated.View entering={FadeIn} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar name={name || '?'} seed={userId ?? undefined} size={56} />
        <Text tone="muted" style={{ flex: 1 }}>
          {name.trim() ? `Hi, ${name.trim().split(/\s+/)[0]}!` : 'Your initials show here until you add a photo.'}
        </Text>
      </Animated.View>
      <Input label={t('setup.name')} placeholder="Juan Dela Cruz" value={name} onChangeText={setName} autoFocus returnKeyType="next" onSubmitEditing={() => name.trim().length >= 2 && setStep('photo')} />
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

const styles = StyleSheet.create({
  empty: { width: 132, height: 132, borderRadius: 66, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: 4, bottom: 4, width: 36, height: 36, borderRadius: 18, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
});
