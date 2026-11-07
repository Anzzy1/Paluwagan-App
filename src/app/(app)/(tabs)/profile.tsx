import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Platform, StyleSheet, View } from 'react-native';

import { Mascot } from '@/components/Mascot';
import { Avatar, Chip, Divider, IconButton, Input, ProgressRing, Stat } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { Columns, Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useMyCircles, useSetAvatar, useUpdateProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { peso, trustLabel } from '@/lib/format';
import { useColors } from '@/lib/prefs';
import { badgesFor, onTimeStreak } from '@/lib/rewards';
import { notify, notifyError } from '@/lib/alert';

export default function ProfileTab() {
  const { profile, session, isDemo, isGuest } = useAuth();
  const circles = useMyCircles();
  const [edit, setEdit] = useState(false);
  const [photo, setPhoto] = useState(false);

  const all = circles.data ?? [];
  const paid = all.flatMap((mc) => mc.contributions.filter((k) => k.status === 'confirmed' && !k.auto));
  const onTime = paid.filter((k) => k.on_time).length;
  const received = all
    .filter((mc) => mc.rounds.some((r) => r.slot_group === mc.membership.slot_group && r.status === 'completed'))
    .reduce((s, mc) => s + Number(mc.circle.amount) * mc.circle.slots * Number(mc.membership.share), 0);
  const score = profile?.tiwala_score ?? 80;
  const tl = trustLabel(score);
  const c = useColors();
  const streak = onTimeStreak(all);
  const badges = badgesFor(all, profile);
  const earned = badges.filter((b) => b.earned).length;

  const identity = (
    <Card style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <PressableScale onPress={() => setPhoto(true)} scaleTo={0.95} accessibilityLabel="Change profile picture" disabled={isDemo} dimWhenDisabled={false}>
          <Avatar name={profile?.full_name} seed={profile?.id} uri={profile?.avatar_url} size={64} />
          {!isDemo && (
            <View style={[styles.camBadge, { backgroundColor: c.brand, borderColor: c.surface }]}>
              <Feather name="camera" size={12} color={c.onBrand} />
            </View>
          )}
        </PressableScale>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h2">{profile?.full_name}</Text>
          <Text variant="small" tone="muted">
            {isDemo ? 'Sample data' : isGuest ? 'Guest account · testing mode' : (session?.user.email ?? session?.user.phone)}
          </Text>
        </View>
        <Button title="Edit" size="sm" variant="secondary" full={false} icon="edit-2" onPress={() => setEdit(true)} />
      </View>
      <Divider />
      <Row label="GCash / Maya" value={profile?.gcash_number || 'Not set'} />
    </Card>
  );

  const rewards = (
    <>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.warningBg, borderColor: c.warningBg }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.warning, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="zap" size={24} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="h1" tone="warning">
            {streak} on-time streak
          </Text>
          <Text variant="small" tone="warning">
            {streak > 0 ? 'Every on-time payment adds to your streak. Don’t break it!' : 'Pay your next contribution on time to start a streak.'}
          </Text>
        </View>
      </Card>
      <Card style={{ gap: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="h3">Badges</Text>
          <Chip label={`${earned} of ${badges.length} unlocked`} tone="brand" />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 18 }}>
          {badges.map((b) => (
            <View key={b.id} style={{ width: '25%', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
              <View
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 29,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: b.earned ? b.color : c.surfaceAlt,
                  borderWidth: 3,
                  borderColor: b.earned ? c.goldSoft : c.border,
                }}>
                <Feather name={b.earned ? b.icon : 'lock'} size={22} color={b.earned ? '#fff' : c.textFaint} />
              </View>
              <Text variant="caption" center numberOfLines={1} tone={b.earned ? 'default' : 'faint'}>
                {b.title}
              </Text>
              <Text variant="caption" center tone="faint" style={{ fontSize: 10, lineHeight: 13 }} numberOfLines={2}>
                {b.body}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </>
  );

  const trust = (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      <ProgressRing size={84} stroke={8} progress={score / 100}>
        <Text variant="h1">{score}</Text>
      </ProgressRing>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="h3">Trust Score</Text>
          <Chip label={tl.label} tone={tl.tone} />
        </View>
        <Text variant="small" tone="muted">
          Based on your on-time contributions across all paluwagan. Admins see this when you request to join.
        </Text>
      </View>
      <Mascot size={64} mood={score >= 85 ? 'excited' : score >= 70 ? 'happy' : 'worried'} pose={score >= 85 ? 'cheer' : 'coin'} />
    </Card>
  );

  return (
    <Screen tabs title="Profile" right={<IconButton icon="settings" label="Settings" onPress={() => router.push('/settings' as Href)} />}>
      <Columns
        main={
          <>
            {identity}
            {trust}
            {rewards}
          </>
        }
        side={
          <View style={styles.stats}>
            <Stat label="Paluwagan" value={String(all.length)} />
            <Stat label="On-time rate" value={paid.length ? `${Math.round((onTime / paid.length) * 100)}%` : '—'} />
            <Stat label="Received" value={peso(received, { compact: true })} />
          </View>
        }
      />
      <EditProfileSheet open={edit} onClose={() => setEdit(false)} />
      <PhotoSheet open={photo} onClose={() => setPhoto(false)} />
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text tone="muted">{label}</Text>
      <Text variant="bodyMedium">{value}</Text>
    </View>
  );
}

type Photo = { uri: string; mime?: string | null };

/** Opens the library or camera with a square crop. Returns null if cancelled or rejected. */
async function pickPhoto(camera: boolean): Promise<Photo | null> {
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 };
  if (camera) {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) {
      notify('Camera access needed', 'Allow camera access in your phone settings to take a photo.');
      return null;
    }
  }
  const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  const a = res.canceled ? null : res.assets[0];
  if (!a) return null;
  if (a.fileSize && a.fileSize > 5 * 1024 * 1024) {
    notify('Photo too large', 'Please choose a photo under 5 MB.');
    return null;
  }
  return { uri: a.uri, mime: a.mimeType };
}

function EditProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useColors();
  const { profile } = useAuth();
  const update = useUpdateProfile();
  const setAvatar = useSetAvatar();
  const [name, setName] = useState('');
  const [gcash, setGcash] = useState('');
  /** Staged photo change, applied on Save: a new photo, 'remove', or null for no change. */
  const [photo, setPhoto] = useState<Photo | 'remove' | null>(null);

  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && profile) {
      setName(profile.full_name);
      setGcash(profile.gcash_number ?? '');
      setPhoto(null);
    }
  }

  const preview = photo === 'remove' ? null : (photo?.uri ?? profile?.avatar_url);
  const choose = async (camera: boolean) => {
    const p = await pickPhoto(camera);
    if (p) setPhoto(p);
  };
  const saving = update.isPending || setAvatar.isPending;
  const save = async () => {
    try {
      if (photo) await setAvatar.mutateAsync(photo === 'remove' ? null : photo);
      await update.mutateAsync({ full_name: name.trim(), gcash_number: gcash.trim() || null });
      onClose();
    } catch (e) {
      notifyError(e, 'Couldn’t save');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Edit profile">
      <View style={{ alignItems: 'center', gap: 12, paddingVertical: 4 }}>
        <PressableScale onPress={() => choose(false)} scaleTo={0.95} accessibilityLabel="Choose profile picture">
          <Avatar name={name || profile?.full_name} seed={profile?.id} uri={preview} size={92} ring={c.border} />
          <View style={[styles.camBadge, styles.camBadgeLg, { backgroundColor: c.brand, borderColor: c.surface }]}>
            <Feather name="camera" size={15} color={c.onBrand} />
          </View>
        </PressableScale>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button title={preview ? 'Change photo' : 'Upload photo'} icon="image" size="sm" variant="secondary" full={false} onPress={() => choose(false)} />
          {Platform.OS !== 'web' && <Button title="Take photo" icon="camera" size="sm" variant="secondary" full={false} onPress={() => choose(true)} />}
          {preview && <Button title="Remove" icon="trash-2" size="sm" variant="danger" full={false} onPress={() => setPhoto('remove')} />}
        </View>
      </View>
      <Input label="Full name" value={name} onChangeText={setName} />
      <Input label="GCash / Maya number" value={gcash} onChangeText={setGcash} keyboardType="phone-pad" />
      <Button title="Save changes" loading={saving} disabled={name.trim().length < 2 || saving} onPress={save} />
    </Sheet>
  );
}

function PhotoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useColors();
  const { profile } = useAuth();
  const setAvatar = useSetAvatar();
  const [busy, setBusy] = useState<'pick' | 'remove' | null>(null);

  const pick = async (camera: boolean) => {
    const p = await pickPhoto(camera);
    if (!p) return;
    setBusy('pick');
    setAvatar.mutate(p, { onSuccess: onClose, onError: (e) => notifyError(e, 'Couldn’t upload photo'), onSettled: () => setBusy(null) });
  };
  const remove = () => {
    setBusy('remove');
    setAvatar.mutate(null, { onSuccess: onClose, onError: (e) => notifyError(e, 'Couldn’t remove photo'), onSettled: () => setBusy(null) });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Profile picture">
      <View style={{ alignItems: 'center', paddingVertical: 4 }}>
        <Avatar name={profile?.full_name} seed={profile?.id} uri={profile?.avatar_url} size={96} ring={c.border} />
      </View>
      <Button title="Choose from library" icon="image" loading={busy === 'pick'} disabled={!!busy} onPress={() => pick(false)} />
      {Platform.OS !== 'web' && <Button title="Take a photo" icon="camera" variant="secondary" disabled={!!busy} onPress={() => pick(true)} />}
      {profile?.avatar_url && <Button title="Remove photo" icon="trash-2" variant="danger" loading={busy === 'remove'} disabled={!!busy} onPress={remove} />}
      <Text variant="small" tone="faint" center>
        Your photo is visible to members of your paluwagan.
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  camBadgeLg: { width: 32, height: 32, borderRadius: 16, right: 0, bottom: 0 },
  camBadge: { position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
