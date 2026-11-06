import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Avatar, Chip, IconButton, ProgressBar } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useJoinCircle, usePreview } from '@/lib/api';
import { frequencyLabel, longDate, looksLikeScam, peso, potOf } from '@/lib/format';
import { useColors, usePrefs } from '@/lib/prefs';
import { errMsg } from '@/lib/supabase';
import { font, radius } from '@/theme/tokens';

function extractCode(data: string): string | null {
  const m = data.match(/code=([A-Za-z0-9]{6})/) ?? data.match(/^([A-Za-z0-9]{6})$/);
  return m ? m[1].toUpperCase() : null;
}

export default function Join() {
  const c = useColors();
  const { lang } = usePrefs();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState((params.code ?? '').toUpperCase().slice(0, 6));
  const [hati, setHati] = useState(false);
  const [agree, setAgree] = useState(false);
  const [scan, setScan] = useState(false);
  const [perm, requestPerm] = useCameraPermissions();
  const preview = usePreview(code);
  const join = useJoinCircle();
  const p = preview.data;

  const openScanner = async () => {
    if (!perm?.granted) {
      const r = await requestPerm();
      if (!r.granted) return Alert.alert('Kailangan ng camera', 'Payagan ang camera para ma-scan ang QR.');
    }
    setScan(true);
  };

  const submit = () =>
    join.mutate(
      { code, hati },
      {
        onSuccess: () => {
          haptic('success');
          Alert.alert('Request sent! 🙌', 'Hintayin ang approval ng admin. Makikita mo ang circle kapag na-approve ka na.', [
            { text: 'Sige', onPress: () => router.back() },
          ]);
        },
        onError: (e) => Alert.alert('May mali', errMsg(e)),
      },
    );

  const slotsLeft = p ? p.slots - Number(p.filled) : 0;

  return (
    <Screen
      right={<IconButton icon="x" onPress={() => router.back()} />}
      title="Sumali sa circle"
      subtitle="I-type ang invite code o i-scan ang QR ng admin."
      footer={
        p && p.status === 'forming' && !p.my_status ? (
          <Button title="Mag-request sumali" onPress={submit} disabled={!agree || slotsLeft < (hati ? 0.5 : 1)} loading={join.isPending} />
        ) : undefined
      }>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <TextInput
          value={code}
          onChangeText={(v) => setCode(v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6))}
          placeholder="ABC123"
          placeholderTextColor={c.textFaint}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus={!params.code}
          style={[styles.code, { color: c.text, backgroundColor: c.surface, borderColor: c.border }]}
        />
        {Platform.OS !== 'web' && <IconButton icon="maximize" size={64} bg={c.accent} color={c.accentInk} onPress={openScanner} />}
      </View>

      {code.length === 6 && preview.isFetched && !p && (
        <Card>
          <Text tone="danger" center>
            Walang circle na may code na {code}.
          </Text>
        </Card>
      )}

      {p && (
        <Animated.View entering={FadeInDown.springify()} style={{ gap: 14 }}>
          <Card tint={p.color} style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar emoji={p.emoji} size={56} bg={c.surface} />
              <View style={{ flex: 1 }}>
                <Text variant="h2">{p.name}</Text>
                <Text variant="small" tone="muted">
                  {frequencyLabel[p.frequency][lang]} · simula {longDate(p.start_date)}
                </Text>
              </View>
            </View>
            <View style={styles.row}>
              <View>
                <Text variant="caption" tone="muted">
                  Hulog
                </Text>
                <Text variant="h2">{peso(p.amount)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="caption" tone="muted">
                  Sahod
                </Text>
                <Text variant="h2">{peso(potOf(p))}</Text>
              </View>
            </View>
            <ProgressBar progress={Number(p.filled) / p.slots} color={c.ink} />
            <Text variant="smallBold" tone="muted">
              {Number(p.filled)} / {p.slots} slots ang puno
            </Text>
          </Card>

          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Feather name="shield" size={22} color={c.success} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyBold">Admin: {p.admin_name}</Text>
              <Text variant="small" tone="muted">
                Tiwala Score {p.admin_tiwala}
              </Text>
            </View>
          </Card>

          {looksLikeScam(p.rules + ' ' + p.name) && (
            <Card style={{ backgroundColor: c.warningBg, borderColor: c.warning }}>
              <Text variant="bodyBold" tone="warning">
                ⚠️ Ingat: may binabanggit na tubo/interest
              </Text>
              <Text variant="small" tone="warning">
                Walang interes ang tunay na paluwagan. Sumali lang kung kilala mo nang personal ang admin.
              </Text>
            </Card>
          )}

          {p.my_status === 'pending' ? (
            <Chip label="Naghihintay ng approval ng admin" tone="info" icon="clock" />
          ) : p.my_status === 'approved' ? (
            <Button title="Member ka na — buksan ang circle" onPress={() => router.replace(`/circle/${p.id}`)} />
          ) : p.status !== 'forming' ? (
            <Chip label="Sarado na ang circle na ito" tone="neutral" icon="lock" />
          ) : (
            <>
              <PressableScale
                onPress={() => setHati(!hati)}
                style={[styles.toggle, { backgroundColor: c.surface, borderColor: hati ? c.ink : c.border }]}>
                <Text style={{ fontSize: 26, lineHeight: 32 }}>🤝</Text>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyBold">Hati-Slot</Text>
                  <Text variant="small" tone="muted">
                    Kalahating slot: {peso(Number(p.amount) / 2)} kada hulog, {peso(potOf(p) / 2)} na sahod. Ipapares ka ng admin.
                  </Text>
                </View>
                <Feather name={hati ? 'check-square' : 'square'} size={22} color={c.text} />
              </PressableScale>

              <Card style={{ gap: 8 }}>
                <Text variant="h3">📜 Kasunduan</Text>
                <Text variant="small" tone="muted">
                  Late fee: {peso(p.late_fee)} · Palugit: {p.grace_days} araw
                </Text>
                <Text>{p.rules || 'Walang dagdag na rules.'}</Text>
              </Card>
              <PressableScale onPress={() => setAgree(!agree)} style={styles.agree} hapticOnPress>
                <Feather name={agree ? 'check-circle' : 'circle'} size={22} color={agree ? c.success : c.textFaint} />
                <Text variant="small" style={{ flex: 1 }}>
                  Nabasa ko at sumasang-ayon ako sa kasunduan. Itatala ang pangalan at oras ng pagpayag ko.
                </Text>
              </PressableScale>
            </>
          )}
        </Animated.View>
      )}

      <Sheet open={scan} onClose={() => setScan(false)} title="I-scan ang QR">
        {scan && (
          <View style={styles.camWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                const found = extractCode(data);
                if (found) {
                  haptic('success');
                  setCode(found);
                  setScan(false);
                }
              }}
            />
          </View>
        )}
        <Button title="Isara" variant="secondary" onPress={() => setScan(false)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  code: {
    flex: 1,
    height: 64,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: 20,
    fontFamily: font.extrabold,
    fontSize: 30,
    letterSpacing: 8,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.lg, borderWidth: 2 },
  agree: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 4 },
  camWrap: { height: 320, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' },
});
