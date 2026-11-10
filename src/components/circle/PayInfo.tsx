import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip, Input } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { notifyError } from '@/lib/alert';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/lib/prefs';
import type { Circle, PayMethod } from '@/lib/types';
import { radius } from '@/theme/tokens';

/** What the admin fills in. `method: null` = face to face / agree in the chat. */
export type PayInfoValue = {
  method: PayMethod | null;
  name: string;
  number: string;
  note: string;
  /** Already uploaded QR (storage path). */
  qrPath: string | null;
  /** New QR picked on this device, uploaded on save. */
  qrLocal: { uri: string; mime?: string | null } | null;
};

export const emptyPayInfo: PayInfoValue = { method: null, name: '', number: '', note: '', qrPath: null, qrLocal: null };

export const payInfoOf = (c: Circle): PayInfoValue => ({
  method: c.pay_method ?? null,
  name: c.pay_name ?? '',
  number: c.pay_number ?? '',
  note: c.pay_note ?? '',
  qrPath: c.pay_qr_path ?? null,
  qrLocal: null,
});

const METHODS: { value: PayMethod | null; label: string }[] = [
  { value: null, label: 'Face to face' },
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
  { value: 'bank', label: 'Bank' },
  { value: 'other', label: 'Other' },
];
export const methodLabel = (m: PayMethod | null | undefined) => METHODS.find((x) => x.value === (m ?? null))?.label ?? 'Other';

/** Upload a new QR (if any) and save the details (0023 set_pay_info). */
export async function savePayInfo(circleId: string, v: PayInfoValue) {
  let qrPath = v.method ? v.qrPath : null;
  if (v.method && v.qrLocal) {
    const ext = v.qrLocal.mime?.includes('png') ? 'png' : 'jpg';
    const path = `${circleId}/qr-${Date.now()}.${ext}`;
    const body = await (await fetch(v.qrLocal.uri)).arrayBuffer();
    const up = await supabase.storage.from('pay-qr').upload(path, body, { contentType: v.qrLocal.mime ?? `image/${ext}`, upsert: false });
    if (up.error) throw up.error;
    qrPath = path;
  }
  const { error } = await supabase.rpc('set_pay_info', {
    p_circle: circleId,
    p_method: v.method,
    p_name: v.name,
    p_number: v.number,
    p_note: v.note,
    p_qr_path: qrPath,
  });
  if (error) throw error;
}

function usePayQr(path: string | null | undefined) {
  return useQuery({
    queryKey: ['pay-qr', path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('pay-qr').createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

/** The form: method chips, account name and number, QR image, note. */
export function PayInfoFields({ value, onChange }: { value: PayInfoValue; onChange: (v: PayInfoValue) => void }) {
  const c = useColors();
  const set = (patch: Partial<PayInfoValue>) => onChange({ ...value, ...patch });
  const saved = usePayQr(value.qrLocal ? null : value.qrPath);
  const qrUri = value.qrLocal?.uri ?? saved.data ?? null;
  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled && res.assets[0]) set({ qrLocal: { uri: res.assets[0].uri, mime: res.assets[0].mimeType } });
  };
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.wrapRow}>
        {METHODS.map((m) => (
          <PressableScale key={m.label} hapticOnPress={false} onPress={() => set({ method: m.value })}>
            <Chip label={m.label} tone={value.method === m.value ? 'ink' : 'neutral'} icon={m.value ? undefined : 'users'} />
          </PressableScale>
        ))}
      </View>
      {value.method ? (
        <>
          <Input label="Account name" placeholder="e.g. Juan Dela Cruz" value={value.name} onChangeText={(name) => set({ name })} maxLength={60} />
          <Input
            label={value.method === 'bank' ? 'Bank and account number' : 'Number'}
            placeholder={value.method === 'bank' ? 'e.g. BPI 1234 5678 90' : '09XX XXX XXXX'}
            value={value.number}
            onChangeText={(number) => set({ number })}
            keyboardType={value.method === 'bank' || value.method === 'other' ? 'default' : 'phone-pad'}
            maxLength={40}
          />
          <View style={{ gap: 6 }}>
            <Text variant="smallBold">QR code (optional)</Text>
            {qrUri ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Image source={{ uri: qrUri }} style={styles.qrSmall} contentFit="contain" />
                <View style={{ gap: 8 }}>
                  <Button title="Change" size="sm" variant="secondary" full={false} onPress={pick} />
                  <Button title="Remove" size="sm" variant="ghost" full={false} onPress={() => set({ qrLocal: null, qrPath: null })} />
                </View>
              </View>
            ) : (
              <PressableScale onPress={pick} hapticOnPress={false} style={[styles.pick, { borderColor: c.borderStrong }]}>
                <Feather name="maximize" size={20} color={c.textMuted} />
                <Text variant="smallBold" tone="muted">
                  Add a QR code screenshot
                </Text>
              </PressableScale>
            )}
          </View>
        </>
      ) : (
        <Text variant="small" tone="muted">
          Members pay you in person, or you agree on it in the group chat. You can add GCash or Maya details later.
        </Text>
      )}
      <Input label="Note for members (optional)" placeholder="e.g. Send before 8 PM and upload the receipt" value={value.note} onChangeText={(note) => set({ note })} maxLength={200} />
    </View>
  );
}

/** Members see where to send their hulog. Returns null when nothing is set. */
export function PayInfoCard({ circle, compact }: { circle: Circle; compact?: boolean }) {
  const c = useColors();
  const qr = usePayQr(circle.pay_qr_path);
  const [big, setBig] = useState(false);
  if (!circle.pay_method && !circle.pay_note) return null;
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Feather name={circle.pay_method ? 'smartphone' : 'users'} size={18} color={c.brand} />
        <Text variant={compact ? 'bodyBold' : 'h3'} style={{ flex: 1 }}>
          {circle.pay_method ? `Pay via ${methodLabel(circle.pay_method)}` : 'Pay face to face'}
        </Text>
      </View>
      {circle.pay_method && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            {!!circle.pay_name && <Text variant="bodyBold">{circle.pay_name}</Text>}
            {!!circle.pay_number && (
              <Text variant="body" style={{ fontVariant: ['tabular-nums'] }} selectable>
                {circle.pay_number}
              </Text>
            )}
          </View>
          {!!circle.pay_number && (
            <PressableScale
              onPress={async () => {
                await Clipboard.setStringAsync(circle.pay_number!);
                haptic('success');
              }}
              accessibilityLabel="Copy number"
              style={[styles.copy, { backgroundColor: c.surfaceAlt }]}>
              <Feather name="copy" size={15} color={c.text} />
            </PressableScale>
          )}
        </View>
      )}
      {!!qr.data && (
        <PressableScale onPress={() => setBig(!big)} hapticOnPress={false} style={{ alignSelf: 'center' }}>
          <Image source={{ uri: qr.data }} style={big ? styles.qrBig : styles.qr} contentFit="contain" />
          <Text variant="caption" tone="faint" center>
            {big ? 'Tap to shrink' : 'Tap to enlarge · scan with your app'}
          </Text>
        </PressableScale>
      )}
      {!!circle.pay_note && (
        <Text variant="small" tone="muted">
          {circle.pay_note}
        </Text>
      )}
    </Card>
  );
}

/** Admin: change where members pay. */
export function PayInfoSheet({ open, onClose, circle }: { open: boolean; onClose: () => void; circle: Circle }) {
  const qc = useQueryClient();
  const [value, setValue] = useState<PayInfoValue>(payInfoOf(circle));
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValue(payInfoOf(circle));
  }
  const save = async () => {
    setSaving(true);
    try {
      await savePayInfo(circle.id, value);
      await qc.invalidateQueries({ queryKey: ['circle', circle.id] });
      haptic('success');
      onClose();
    } catch (e) {
      notifyError(e, 'Couldn’t save the payment details');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Where to pay" subtitle="Members see this when they pay their hulog.">
      <PayInfoFields value={value} onChange={setValue} />
      <Button title="Save" icon="check" onPress={save} loading={saving} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pick: { height: 84, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6 },
  qrSmall: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: '#fff' },
  qr: { width: 160, height: 160, borderRadius: radius.md, backgroundColor: '#fff' },
  qrBig: { width: 300, height: 300, borderRadius: radius.md, backgroundColor: '#fff' },
  copy: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
