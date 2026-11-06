import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { Avatar, Input } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useSubmitProof } from '@/lib/api';
import { isOverdue } from '@/lib/derive';
import { longDate, peso } from '@/lib/format';
import { useColors } from '@/lib/prefs';
import { errMsg } from '@/lib/supabase';
import type { Circle, Contribution, Member, Round } from '@/lib/types';
import { radius } from '@/theme/tokens';

export function PaySheet({
  open,
  onClose,
  circle,
  round,
  contribution,
  recipients,
}: {
  open: boolean;
  onClose: () => void;
  circle: Circle;
  round: Round;
  contribution: Contribution;
  recipients: Member[];
}) {
  const c = useColors();
  const submit = useSubmitProof(circle.id);
  const [image, setImage] = useState<{ uri: string; mime?: string | null } | null>(null);
  const [note, setNote] = useState('');
  const late = isOverdue(round, circle.grace_days);
  const lateFee = late ? Number(circle.late_fee) : 0;

  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setImage(null);
      setNote('');
    }
  }

  const pick = async (camera: boolean) => {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
    if (camera) {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) return Alert.alert('Kailangan ng camera permission');
    }
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!res.canceled && res.assets[0]) setImage({ uri: res.assets[0].uri, mime: res.assets[0].mimeType });
  };

  const send = () =>
    image &&
    submit.mutate(
      { contributionId: contribution.id, uri: image.uri, mime: image.mime, note: note.trim() || undefined },
      {
        onSuccess: () => {
          haptic('success');
          onClose();
        },
        onError: (e) => Alert.alert('Hindi na-upload', errMsg(e)),
      },
    );

  return (
    <Sheet open={open} onClose={onClose} title="Magbayad">
      <Card tint={circle.color} style={{ gap: 4 }}>
        <Text variant="caption" tone="muted">
          Round {round.round_no} · due {longDate(round.due_date)}
        </Text>
        <Text variant="display">{peso(Number(contribution.amount) + lateFee)}</Text>
        {lateFee > 0 && (
          <Text variant="smallBold" tone="warning">
            Kasama ang {peso(lateFee)} late fee
          </Text>
        )}
      </Card>

      <Text variant="h3">1. Ipadala sa may sahod</Text>
      {recipients.map((m) => (
        <Card key={m.id} style={styles.recipient}>
          <Avatar emoji={m.profiles?.avatar_emoji} size={44} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyBold">{m.profiles?.full_name}</Text>
            <Text variant="small" tone="muted">
              {m.profiles?.gcash_number ? `GCash/Maya: ${m.profiles.gcash_number}` : 'Walang naka-set na GCash — itanong sa kanya'}
            </Text>
          </View>
          {!!m.profiles?.gcash_number && (
            <PressableScale
              onPress={async () => {
                await Clipboard.setStringAsync(m.profiles!.gcash_number!);
                haptic('success');
              }}
              style={[styles.copy, { backgroundColor: c.surfaceAlt }]}>
              <Feather name="copy" size={16} color={c.text} />
            </PressableScale>
          )}
        </Card>
      ))}

      <Text variant="h3">2. I-upload ang resibo</Text>
      {image ? (
        <PressableScale onPress={() => pick(false)}>
          <Image source={{ uri: image.uri }} style={styles.preview} contentFit="cover" />
        </PressableScale>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PressableScale onPress={() => pick(false)} style={[styles.pick, { borderColor: c.border, backgroundColor: c.surface }]}>
            <Feather name="image" size={26} color={c.text} />
            <Text variant="smallBold">Screenshot</Text>
          </PressableScale>
          {Platform.OS !== 'web' && (
            <PressableScale onPress={() => pick(true)} style={[styles.pick, { borderColor: c.border, backgroundColor: c.surface }]}>
              <Feather name="camera" size={26} color={c.text} />
              <Text variant="smallBold">Kunan ng litrato</Text>
            </PressableScale>
          )}
        </View>
      )}
      <Input placeholder="Note (optional) — hal. Ref no. 1234" value={note} onChangeText={setNote} />
      <Button title="Isumite ang bayad" icon="check" onPress={send} disabled={!image} loading={submit.isPending} />
      <Text variant="small" tone="faint" center>
        Ang may sahod ang magko-confirm na natanggap niya ang pera.
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  recipient: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  copy: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pick: {
    flex: 1,
    height: 110,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  preview: { width: '100%', height: 260, borderRadius: radius.lg },
});
