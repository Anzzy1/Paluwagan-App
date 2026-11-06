import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar, Input, ProgressRing, Segmented } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useMyCircles, useUpdateProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { peso, tiwalaLabel } from '@/lib/format';
import { usePrefs, useColors, type ThemePref } from '@/lib/prefs';
import { errMsg } from '@/lib/supabase';
import { avatarEmojis } from '@/theme/tokens';

export default function ProfileTab() {
  const c = useColors();
  const { profile, session, signOut } = useAuth();
  const { lang, setLang, themePref, setThemePref } = usePrefs();
  const circles = useMyCircles();
  const [edit, setEdit] = useState(false);

  const all = circles.data ?? [];
  const paid = all.flatMap((mc) => mc.contributions.filter((k) => k.status === 'confirmed' && !k.auto));
  const onTime = paid.filter((k) => k.on_time).length;
  const received = all
    .filter((mc) => mc.rounds.some((r) => r.slot_group === mc.membership.slot_group && r.status === 'completed'))
    .reduce((s, mc) => s + Number(mc.circle.amount) * mc.circle.slots * Number(mc.membership.share), 0);
  const score = profile?.tiwala_score ?? 80;
  const tl = tiwalaLabel(score);

  return (
    <Screen tabs>
      <View style={{ alignItems: 'center', gap: 8, marginTop: 16 }}>
        <Avatar emoji={profile?.avatar_emoji} size={92} bg={c.accent} />
        <Text variant="h1">{profile?.full_name}</Text>
        <Text variant="small" tone="muted">
          {session?.user.email ?? session?.user.phone}
        </Text>
        <Button title="I-edit ang profile" size="sm" variant="secondary" full={false} icon="edit-2" onPress={() => setEdit(true)} />
      </View>

      <Card tint="leaf">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <ProgressRing size={96} stroke={10} progress={score / 100} color={c.ink} track="rgba(0,0,0,0.08)">
            <Text variant="h1">{score}</Text>
          </ProgressRing>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="caption" tone="muted">
              Tiwala Score
            </Text>
            <Text variant="h2">
              {tl.emoji} {tl.label}
            </Text>
            <Text variant="small" tone="muted">
              Batay sa on-time na hulog mo sa lahat ng circle. Nakikita ito ng mga admin kapag nag-request ka sumali.
            </Text>
          </View>
        </View>
      </Card>

      <View style={styles.stats}>
        <Stat label="Circles" value={String(all.length)} />
        <Stat label="On-time" value={paid.length ? `${Math.round((onTime / paid.length) * 100)}%` : '—'} />
        <Stat label="Natanggap" value={peso(received, { compact: true })} />
      </View>

      <Card style={{ gap: 14 }}>
        <Text variant="h3">Wika / Language</Text>
        <Segmented value={lang} onChange={setLang} options={[{ value: 'fil', label: 'Taglish' }, { value: 'en', label: 'English' }]} />
        <Text variant="h3">Itsura</Text>
        <Segmented<ThemePref>
          value={themePref}
          onChange={setThemePref}
          options={[
            { value: 'system', label: 'Auto' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </Card>

      <Card style={{ gap: 6 }}>
        <Text variant="h3">GCash / Maya</Text>
        <Text tone="muted">{profile?.gcash_number || 'Wala pang naka-set — idagdag para madaling mabayaran.'}</Text>
      </Card>

      <Button title="Mag-logout" variant="danger" icon="log-out" onPress={() => Alert.alert('Mag-logout?', '', [{ text: 'Hindi' }, { text: 'Oo', style: 'destructive', onPress: signOut }])} />
      <Text variant="small" tone="faint" center>
        Paluwagan v1.0 · Hindi humahawak ng pera ang app — record at paalala lang.
      </Text>

      <EditProfileSheet open={edit} onClose={() => setEdit(false)} />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 8 }}>
      <Text variant="h2">{value}</Text>
      <Text variant="small" tone="muted">
        {label}
      </Text>
    </Card>
  );
}

function EditProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useColors();
  const { profile } = useAuth();
  const update = useUpdateProfile();
  const [name, setName] = useState('');
  const [gcash, setGcash] = useState('');
  const [emoji, setEmoji] = useState('🙂');

  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && profile) {
      setName(profile.full_name);
      setGcash(profile.gcash_number ?? '');
      setEmoji(profile.avatar_emoji);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="I-edit ang profile">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {avatarEmojis.map((e) => (
          <PressableScale key={e} onPress={() => setEmoji(e)}>
            <Avatar emoji={e} size={48} ring={e === emoji ? c.ink : undefined} />
          </PressableScale>
        ))}
      </ScrollView>
      <Input label="Pangalan" value={name} onChangeText={setName} />
      <Input label="GCash / Maya number" value={gcash} onChangeText={setGcash} keyboardType="phone-pad" />
      <Button
        title="I-save"
        loading={update.isPending}
        disabled={name.trim().length < 2}
        onPress={() =>
          update.mutate(
            { full_name: name.trim(), gcash_number: gcash.trim() || null, avatar_emoji: emoji },
            { onSuccess: onClose, onError: (e) => Alert.alert('May mali', errMsg(e)) },
          )
        }
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 10 },
});
