import { Feather } from '@expo/vector-icons';
import { Camera, CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Avatar, IconButton, type IconName, Input, Notice, PurposeIcon } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card, useTint } from '@/components/ui/Card';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { notify, notifyError } from '@/lib/alert';
import { useJoinCircle, usePreview } from '@/lib/api';
import { longDate, looksLikeScam, payoutOf, peso, potOf, scheduleLabel, trustLabel } from '@/lib/format';
import { plannedHulogPerSahod } from '@/lib/derive';
import { useColors, useIsDesktop } from '@/lib/prefs';
import type { CirclePreview } from '@/lib/types';
import { font, radius } from '@/theme/tokens';
import { withAccount } from '@/components/AccountGate';

type Method = 'code' | 'link' | 'scan';

/** Pull a 6-character invite code out of a raw code, an invite link or a QR payload. */
function extractCode(data: string): string | null {
  const text = data.trim();
  const m = text.match(/[?&]code=([A-Za-z0-9]{6})\b/) ?? text.match(/\/join\/([A-Za-z0-9]{6})\b/) ?? text.replace(/[\s-]/g, '').match(/^([A-Za-z0-9]{6})$/);
  return m ? m[1].toUpperCase() : null;
}

const METHODS: { value: Method; icon: IconName; label: string }[] = [
  { value: 'code', icon: 'hash', label: 'Code' },
  { value: 'link', icon: 'link', label: 'Link' },
  { value: 'scan', icon: 'maximize', label: 'Scan QR' },
];

// ---------------------------------------------------------------- code boxes
function CodeBoxes({ code, onChange, autoFocus }: { code: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const c = useColors();
  const input = useRef<TextInputInstance>(null);
  const [focused, setFocused] = useState(false);
  return (
    <PressableScale hapticOnPress={false} scaleTo={1} onPress={() => input.current?.focus()} style={styles.boxes}>
      {Array.from({ length: 6 }, (_, i) => {
        const active = focused && i === Math.min(code.length, 5);
        return (
          <View key={i} style={[styles.box, { backgroundColor: c.surfaceAlt, borderColor: active ? c.brand : 'transparent' }]}>
            <Text style={{ fontFamily: font.bold, fontSize: 24, lineHeight: 30 }}>{code[i] ?? ''}</Text>
          </View>
        );
      })}
      <TextInput
        ref={input}
        value={code}
        onChangeText={(v) => onChange(v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus={autoFocus}
        maxLength={6}
        caretHidden
        accessibilityLabel="Invite code"
        style={[StyleSheet.absoluteFill, { opacity: 0.01, color: 'transparent' }, { outlineStyle: 'none' } as never]}
      />
    </PressableScale>
  );
}

// ---------------------------------------------------------------- scanner
function Scanner({ onCode }: { onCode: (code: string) => void }) {
  const c = useColors();
  const [perm, requestPerm] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const done = useRef(false);

  const handle = (data: string) => {
    const found = extractCode(data);
    if (found && !done.current) {
      done.current = true;
      haptic('success');
      onCode(found);
    }
    return !!found;
  };

  const upload = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets[0]) return;
    setBusy(true);
    try {
      const hits = await Camera.scanFromURLAsync(res.assets[0].uri, ['qr']);
      if (!hits.some((h) => handle(h.data))) notify('No invite found', 'We couldn’t find a Paluwagan invite QR code in that image.');
    } catch {
      notify('Couldn’t read the image', 'Try scanning the QR code with your camera instead.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      {perm?.granted ? (
        <View style={styles.cam}>
          <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => handle(data)} />
          <View style={styles.frame} pointerEvents="none">
            {[styles.cTL, styles.cTR, styles.cBL, styles.cBR].map((corner, i) => (
              <View key={i} style={[styles.corner, corner]} />
            ))}
          </View>
          <View style={styles.camHint} pointerEvents="none">
            <Text variant="smallBold" color="#fff">
              Point at the invite QR code
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.cam, styles.camOff, { backgroundColor: c.surfaceAlt }]}>
          <View style={[styles.camOffIcon, { backgroundColor: c.brandSoft }]}>
            <Feather name="camera" size={26} color={c.brand} />
          </View>
          <Text variant="h3" center>
            Scan the invite QR
          </Text>
          <Text variant="small" tone="muted" center style={{ maxWidth: 260 }}>
            Allow camera access to scan the QR code your admin shared.
          </Text>
          <Button
            title="Turn on camera"
            icon="camera"
            size="md"
            full={false}
            style={{ alignSelf: 'center' }}
            onPress={async () => {
              const r = await requestPerm();
              if (!r.granted) notify('Camera access needed', 'Allow camera access in your settings, or upload a screenshot of the QR code instead.');
            }}
          />
        </View>
      )}
      <Button title={busy ? 'Reading image…' : 'Upload QR screenshot'} icon="image" variant="secondary" size="md" onPress={upload} loading={busy} />
    </View>
  );
}

// ---------------------------------------------------------------- found circle
function CircleHero({ p, onChange }: { p: CirclePreview; onChange: () => void }) {
  const t = useTint(p.color);
  const filled = Number(p.filled);
  // Head count (from 0011); older databases only send slots, so round those up.
  const people = p.joined ?? Math.ceil(filled);
  return (
    <LinearGradient colors={t.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.heroDeco} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={styles.heroIcon}>
          <PurposeIcon icon={p.emoji} size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="h2" color="#fff" numberOfLines={1}>
            {p.name}
          </Text>
          <Text variant="small" color="rgba(255,255,255,0.85)">
            Starts {longDate(p.start_date)}
          </Text>
        </View>
        <PressableScale onPress={onChange} hapticOnPress={false} style={styles.heroChange}>
          <Text variant="caption" color="#fff">
            Change
          </Text>
        </PressableScale>
      </View>
      <View>
        <Text variant="overline" color="rgba(255,255,255,0.75)">
          Per sahod
        </Text>
        <Text variant="hero" color="#fff">
          {peso(potOf(p) * plannedHulogPerSahod(p))}
        </Text>
      </View>
      <View style={styles.heroStats}>
        {[
          ['Contribution', peso(p.amount)],
          ['Hulog', scheduleLabel(p)],
          ['Sahod', payoutOf(p) ? scheduleLabel(payoutOf(p)!) : 'Every hulog'],
          ['Late fee', peso(p.late_fee)],
          ['Grace', `${p.grace_days} day${p.grace_days === 1 ? '' : 's'}`],
        ].map(([k, v]) => (
          <View key={k} style={{ flex: 1, minWidth: 90 }}>
            <Text variant="caption" color="rgba(255,255,255,0.75)">
              {k}
            </Text>
            <Text variant="bodyBold" color="#fff" numberOfLines={1}>
              {v}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ gap: 6 }}>
        <Text variant="caption" color="rgba(255,255,255,0.9)">
          {p.status === 'forming' ? `${people} ${people === 1 ? 'member has' : 'members have'} joined so far` : `${p.slots} slots`}
        </Text>
      </View>
    </LinearGradient>
  );
}

// ---------------------------------------------------------------- screen
function JoinScreen() {
  const c = useColors();
  const desktop = useIsDesktop();
  const params = useLocalSearchParams<{ code?: string }>();
  const initial = extractCode(params.code ?? '') ?? '';
  const [method, setMethod] = useState<Method>('code');
  const [code, setCode] = useState(initial);
  const [link, setLink] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [hati, setHati] = useState(false);
  const [agree, setAgree] = useState(false);
  // A new invite link opened while this screen is showing replaces the code.
  const [seen, setSeen] = useState(params.code);
  if (params.code !== seen) {
    setSeen(params.code);
    const found = extractCode(params.code ?? '');
    if (found) setCode(found);
  }
  const preview = usePreview(code);
  const join = useJoinCircle();
  const p = preview.data;

  const reset = () => {
    setCode('');
    setLink('');
    setPassword('');
    setAgree(false);
    setHati(false);
  };

  const onLink = (v: string) => {
    setLink(v);
    const found = extractCode(v);
    if (found) setCode(found);
  };

  const paste = async () => {
    const text = await Clipboard.getStringAsync();
    if (!text) return notify('Clipboard is empty', 'Copy the invite link first, then tap Paste.');
    onLink(text);
    if (!extractCode(text)) notify('Not an invite link', 'That doesn’t look like a Paluwagan invite link.');
  };

  const submit = () =>
    join.mutate(
      { code, hati: hati && !p?.replacing, password },
      {
        onSuccess: () => {
          haptic('success');
          notify('Request sent', 'The admin will review your request. The paluwagan will appear in your list once you’re approved.', 'success');
          router.back();
        },
        onError: (e) => notifyError(e, 'Couldn’t send request'),
      },
    );

  // Open size: up to 50 slots while forming.
  const slotsLeft = p ? 50 - Number(p.filled) : 0;
  // Open while forming, or while a running paluwagan looks for a replacement (who takes over a full slot).
  const open = !!p && (p.status === 'forming' || (p.status === 'active' && !!p.replacing));
  const canRequest = open && !p.my_status;
  const ready = canRequest && agree && (!p.has_password || password.length > 0) && (p.replacing || slotsLeft >= (hati ? 0.5 : 1));

  // -------- step 1: find the circle
  const finder = (
    <Animated.View entering={FadeIn.duration(220)} style={{ gap: 16 }}>
      <Card style={{ gap: 16 }}>
        <View style={[styles.tabs, { backgroundColor: c.surfaceAlt }]}>
          {METHODS.map((m) => {
            const on = m.value === method;
            return (
              <PressableScale key={m.value} hapticOnPress={false} onPress={() => setMethod(m.value)} style={[styles.tab, on && [styles.tabOn, { backgroundColor: c.surface, shadowColor: c.shadow }]]}>
                <Feather name={m.icon} size={15} color={on ? c.brand : c.textMuted} />
                <Text variant="smallBold" color={on ? c.text : c.textMuted}>
                  {m.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>

        {method === 'code' && (
          <View style={{ gap: 10 }}>
            <Text variant="h3">Enter the invite code</Text>
            <CodeBoxes code={code} onChange={setCode} autoFocus={!initial} />
            <Text variant="small" tone="faint">
              6 letters and numbers, e.g. K7PX2M
            </Text>
          </View>
        )}

        {method === 'link' && (
          <View style={{ gap: 10 }}>
            <Text variant="h3">Paste the invite link</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Input placeholder="https://…/join?code=K7PX2M" value={link} onChangeText={onLink} autoCapitalize="none" autoCorrect={false} />
              </View>
              <Button title="Paste" icon="clipboard" size="md" variant="secondary" full={false} onPress={paste} />
            </View>
            <Text variant="small" tone="faint">
              Opening the link on your phone also brings you here automatically.
            </Text>
          </View>
        )}

        {method === 'scan' && <Scanner onCode={setCode} />}

        {preview.isFetching && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color={c.brand} />
            <Text variant="small" tone="muted">
              Looking up {code}…
            </Text>
          </View>
        )}
        {code.length === 6 && preview.isFetched && !preview.isFetching && !p && (
          <Notice tone="danger" icon="x-circle" title={`No paluwagan found for ${code}`} body="Check the code with your admin and try again." />
        )}
      </Card>

      <Card style={{ gap: 14 }}>
        <Text variant="h3">How joining works</Text>
        {[
          ['send', 'Get the invite', 'Your admin shares a code, link or QR code.'],
          ['lock', 'Enter the password', 'Ask the admin privately. It keeps strangers out.'],
          ['user-check', 'Wait for approval', 'The admin reviews your request before you’re in.'],
        ].map(([icon, title, body], i) => (
          <View key={title} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={[styles.stepIcon, { backgroundColor: c.brandSoft }]}>
              <Feather name={icon as IconName} size={16} color={c.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyBold">
                {i + 1}. {title}
              </Text>
              <Text variant="small" tone="muted">
                {body}
              </Text>
            </View>
          </View>
        ))}
      </Card>
    </Animated.View>
  );

  // -------- step 2: review + password + agreement
  const details = p && (
    <Animated.View entering={FadeIn.duration(220)} style={{ gap: 14 }}>
      <CircleHero p={p} onChange={reset} />

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={p.admin_name} size={42} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyBold">{p.admin_name}</Text>
          <Text variant="small" tone="muted">
            Paluwagan admin · Trust Score {p.admin_tiwala} ({trustLabel(p.admin_tiwala).label})
          </Text>
        </View>
        <Feather name="shield" size={20} color={c.brand} />
      </Card>

      {looksLikeScam(p.rules + ' ' + p.name) && (
        <Notice tone="warning" icon="alert-triangle" title="This paluwagan mentions interest or returns" body="A legitimate paluwagan has no interest. Only join if you personally know and trust the admin." />
      )}

      {p.my_status === 'pending' ? (
        <Notice tone="info" icon="clock" title="Request pending" body="The admin hasn’t reviewed your request yet." />
      ) : p.my_status === 'approved' ? (
        <Button title="Open paluwagan" onPress={() => router.replace(`/circle/${p.id}`)} />
      ) : !open ? (
        <Notice tone="info" icon="lock" title="This paluwagan has already started" body="It’s no longer accepting new members." />
      ) : (
        <>
          {p.replacing && (
            <Notice tone="info" icon="user-plus" title="Joining as a replacement" body="This paluwagan is already running. If approved, you take over an existing member’s slot: their payout and the hulog they haven’t paid yet." />
          )}
          {p.has_password && (
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.stepIcon, { backgroundColor: c.brandSoft }]}>
                  <Feather name="lock" size={16} color={c.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="h3">Paluwagan password</Text>
                  <Text variant="small" tone="muted">
                    Ask {p.admin_name.split(' ')[0]} for the password.
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Input placeholder="Enter password" value={password} onChangeText={setPassword} secureTextEntry={!showPw} autoCapitalize="none" autoCorrect={false} />
                </View>
                <IconButton icon={showPw ? 'eye-off' : 'eye'} size={48} onPress={() => setShowPw(!showPw)} label={showPw ? 'Hide password' : 'Show password'} />
              </View>
            </Card>
          )}

          {/* A replacement takes over a whole existing slot, so no split-slot option. */}
          {!p.replacing && (
          <PressableScale onPress={() => setHati(!hati)} hapticOnPress={false} style={[styles.toggle, { backgroundColor: c.surface, borderColor: hati ? c.brand : 'transparent' }]}>
            <View style={[styles.stepIcon, { backgroundColor: hati ? c.brand : c.surfaceAlt }]}>
              <Feather name="users" size={16} color={hati ? c.onBrand : c.textMuted} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyBold">Split slot</Text>
              <Text variant="small" tone="muted">
                Share a slot: pay {peso(Number(p.amount) / 2)}, receive {peso((potOf(p) * plannedHulogPerSahod(p)) / 2)}. The admin pairs you.
              </Text>
            </View>
            <Feather name={hati ? 'check-circle' : 'circle'} size={20} color={hati ? c.brand : c.borderStrong} />
          </PressableScale>
          )}

          <Card style={{ gap: 10 }}>
            <Text variant="h3">Paluwagan agreement</Text>
            <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
              {p.rules || 'No additional rules.'}
            </Text>
            <PressableScale onPress={() => setAgree(!agree)} hapticOnPress={false} style={[styles.agree, { backgroundColor: agree ? c.brandSoft : c.surfaceAlt }]}>
              <Feather name={agree ? 'check-square' : 'square'} size={20} color={agree ? c.brand : c.textFaint} />
              <Text variant="small" style={{ flex: 1 }}>
                I accept the paluwagan agreement. My name and the time of acceptance will be recorded.
              </Text>
            </PressableScale>
          </Card>
        </>
      )}
    </Animated.View>
  );

  return (
    <Screen
      back
      narrow
      title="Join a paluwagan"
      subtitle={p ? 'Review the paluwagan before you request to join.' : 'Use the code, link or QR code from your paluwagan admin.'}
      footer={canRequest ? <Button title="Request to join" icon="send" onPress={submit} disabled={!ready} loading={join.isPending} /> : undefined}>
      <View style={{ gap: 16, maxWidth: desktop ? 640 : undefined }}>{p ? details : finder}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderRadius: radius.pill, padding: 4, gap: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: radius.pill },
  tabOn: { shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  boxes: { flexDirection: 'row', gap: 8 },
  box: { flex: 1, height: 60, borderRadius: radius.md, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  cam: { height: 300, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  camOff: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20 },
  camOffIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  frame: { position: 'absolute', left: '50%', top: '50%', width: 200, height: 200, marginLeft: -100, marginTop: -110 },
  corner: { position: 'absolute', width: 34, height: 34, borderColor: '#fff' },
  cTL: { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 14 },
  cTR: { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 14 },
  cBL: { left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 14 },
  cBR: { right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 14 },
  camHint: { position: 'absolute', bottom: 14, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  stepIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: radius.xl, padding: 20, gap: 16, overflow: 'hidden' },
  heroDeco: { position: 'absolute', right: -40, top: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.14)' },
  heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  heroChange: { backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.lg, borderWidth: 2 },
  agree: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: radius.md },
});

export default withAccount(JoinScreen, 'Join a paluwagan');
