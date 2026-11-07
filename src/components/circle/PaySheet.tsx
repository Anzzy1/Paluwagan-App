import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Avatar, Input, Notice } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { notify, notifyError } from '@/lib/alert';
import { useSubmitProof } from '@/lib/api';
import { reactToPayment } from '@/lib/reactions';
import { dueOf, isOverdue } from '@/lib/derive';
import { longDate, peso } from '@/lib/format';
import { useColors } from '@/lib/prefs';
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
  const due = dueOf(contribution, round);
  const late = isOverdue(due, circle.grace_days);
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
      if (!p.granted) return notify('Camera access needed');
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
          reactToPayment(circle.name, Number(contribution.amount) + lateFee, late);
        },
        onError: (e) => notifyError(e, 'Upload failed'),
      },
    );

  return (
    <Sheet open={open} onClose={onClose} title="Submit payment" subtitle={`Payout ${round.round_no} · hulog due ${longDate(due)}`}>
      <View style={[styles.amount, { backgroundColor: c.surfaceAlt }]}>
        <Text variant="caption" tone="muted">
          Amount due
        </Text>
        <Text variant="display" style={{ fontVariant: ['tabular-nums'] }}>
          {peso(Number(contribution.amount) + lateFee)}
        </Text>
        {lateFee > 0 && (
          <Text variant="small" tone="warning">
            Includes {peso(lateFee)} late fee
          </Text>
        )}
      </View>

      <Text variant="overline" tone="faint">
        Step 1 · Send to the recipient
      </Text>
      {recipients.map((m) => (
        <Card key={m.id} style={styles.recipient}>
          <Avatar name={m.profiles?.full_name} seed={m.user_id} uri={m.profiles?.avatar_url} size={40} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyBold">{m.profiles?.full_name}</Text>
            <Text variant="small" tone="muted">
              {m.profiles?.gcash_number ? `GCash / Maya · ${m.profiles.gcash_number}` : 'No payment number on file'}
            </Text>
          </View>
          {!!m.profiles?.gcash_number && (
            <PressableScale
              onPress={async () => {
                await Clipboard.setStringAsync(m.profiles!.gcash_number!);
                haptic('success');
              }}
              accessibilityLabel="Copy number"
              style={[styles.copy, { backgroundColor: c.surfaceAlt }]}>
              <Feather name="copy" size={15} color={c.text} />
            </PressableScale>
          )}
        </Card>
      ))}

      <Text variant="overline" tone="faint">
        Step 2 · Upload your receipt
      </Text>
      {image ? (
        <PressableScale onPress={() => pick(false)} hapticOnPress={false}>
          <Image source={{ uri: image.uri }} style={styles.preview} contentFit="cover" />
        </PressableScale>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PressableScale onPress={() => pick(false)} hapticOnPress={false} style={[styles.pick, { borderColor: c.borderStrong }]}>
            <Feather name="upload" size={20} color={c.textMuted} />
            <Text variant="smallBold" tone="muted">
              {Platform.OS === 'web' ? 'Choose file' : 'Choose screenshot'}
            </Text>
          </PressableScale>
          {Platform.OS !== 'web' && (
            <PressableScale onPress={() => pick(true)} hapticOnPress={false} style={[styles.pick, { borderColor: c.borderStrong }]}>
              <Feather name="camera" size={20} color={c.textMuted} />
              <Text variant="smallBold" tone="muted">
                Take photo
              </Text>
            </PressableScale>
          )}
        </View>
      )}
      <Input placeholder="Reference number (optional)" value={note} onChangeText={setNote} />
      <Button title="Submit payment" onPress={send} disabled={!image} loading={submit.isPending} />
      <Notice tone="info" icon="info" title="The recipient confirms receipt" body="Your payment is marked as paid once the recipient confirms the transfer." />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  amount: { padding: 16, borderRadius: radius.lg, gap: 2 },
  recipient: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  copy: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pick: { flex: 1, height: 96, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6 },
  preview: { width: '100%', height: 240, borderRadius: radius.lg },
});
