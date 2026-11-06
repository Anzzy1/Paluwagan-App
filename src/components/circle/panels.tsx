import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Avatar, Chip, ProgressBar, StatusChip } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useCircleAction, type CircleDetail } from '@/lib/api';
import { recipientsOf } from '@/lib/derive';
import { displayStatus, firstName, frequencyLabel, longDate, peso, shortDate, slotName, slotsOf } from '@/lib/format';
import { useColors, usePrefs } from '@/lib/prefs';
import { errMsg } from '@/lib/supabase';
import type { Member } from '@/lib/types';
import { radius } from '@/theme/tokens';

const onErr = (e: unknown) => Alert.alert('May mali', errMsg(e));

// ---------------------------------------------------------------- Invite
export function InvitePanel({ code, name }: { code: string; name: string }) {
  const c = useColors();
  const [qr, setQr] = useState(false);
  const link = Linking.createURL('/join', { queryParams: { code } });
  const share = () =>
    Share.share({
      message: `Sali ka sa paluwagan namin na “${name}”! 💰\n\nInvite code: ${code}\nO buksan: ${link}`,
    });
  return (
    <Card style={{ gap: 12 }}>
      <Text variant="caption" tone="muted">
        Invite code
      </Text>
      <View style={styles.codeRow}>
        <Text variant="display" style={{ letterSpacing: 6 }}>
          {code}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <PressableScale
            onPress={async () => {
              await Clipboard.setStringAsync(code);
              haptic('success');
            }}
            style={[styles.round, { backgroundColor: c.surfaceAlt }]}>
            <Feather name="copy" size={18} color={c.text} />
          </PressableScale>
          <PressableScale onPress={() => setQr(true)} style={[styles.round, { backgroundColor: c.surfaceAlt }]}>
            <Feather name="grid" size={18} color={c.text} />
          </PressableScale>
        </View>
      </View>
      <Button title="I-share ang invite" icon="share-2" size="md" onPress={share} />
      <Sheet open={qr} onClose={() => setQr(false)} title="I-scan para sumali">
        <View style={[styles.qr, { backgroundColor: '#fff' }]}>
          <QRCode value={link} size={220} />
        </View>
        <Text variant="h1" center style={{ letterSpacing: 6 }}>
          {code}
        </Text>
        <Button title="Isara" variant="secondary" onPress={() => setQr(false)} />
      </Sheet>
    </Card>
  );
}

// ---------------------------------------------------------------- Forming: admin tools
export function FormingAdmin({ data }: { data: CircleDetail }) {
  const c = useColors();
  const action = useCircleAction(data.circle.id);
  const pending = data.members.filter((m) => m.status === 'pending');
  const slots = slotsOf(data.members);
  const unpaired = slots.filter((s) => s.members.length === 1 && Number(s.members[0].share) === 0.5).map((s) => s.members[0]);
  const [pick, setPick] = useState<string | null>(null);

  return (
    <>
      {pending.length > 0 && (
        <Card style={{ gap: 12 }}>
          <Text variant="h3">Mga gustong sumali ({pending.length})</Text>
          {pending.map((m) => (
            <View key={m.id} style={styles.memberRow}>
              <Avatar emoji={m.profiles?.avatar_emoji} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyBold">{m.profiles?.full_name ?? 'Member'}</Text>
                <Text variant="small" tone="muted">
                  Tiwala {m.profiles?.tiwala_score ?? '—'} {Number(m.share) === 0.5 ? '· Hati-slot' : ''}
                </Text>
              </View>
              <PressableScale
                onPress={() => action.mutate({ fn: 'review_member', args: { p_member: m.id, p_approve: false } }, { onError: onErr })}
                style={[styles.round, { backgroundColor: c.dangerBg }]}>
                <Feather name="x" size={18} color={c.danger} />
              </PressableScale>
              <PressableScale
                onPress={() => action.mutate({ fn: 'review_member', args: { p_member: m.id, p_approve: true } }, { onError: onErr })}
                style={[styles.round, { backgroundColor: c.successBg }]}>
                <Feather name="check" size={18} color={c.success} />
              </PressableScale>
            </View>
          ))}
        </Card>
      )}

      {unpaired.length > 0 && (
        <Card style={{ gap: 10 }}>
          <Text variant="h3">🤝 Ipares ang Hati-Slot</Text>
          <Text variant="small" tone="muted">
            Pumili ng dalawang hati-slot member para pagsamahin sa iisang slot.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {unpaired.map((m) => (
              <PressableScale
                key={m.id}
                onPress={() => {
                  if (!pick) return setPick(m.id);
                  if (pick === m.id) return setPick(null);
                  action.mutate({ fn: 'pair_hati', args: { p_a: pick, p_b: m.id } }, { onError: onErr, onSettled: () => setPick(null) });
                }}>
                <Chip label={m.profiles?.full_name ?? 'Member'} tone={pick === m.id ? 'ink' : 'neutral'} />
              </PressableScale>
            ))}
          </View>
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Timeline
export function Timeline({ data, myGroup }: { data: CircleDetail; myGroup?: string }) {
  const c = useColors();
  const { circle, rounds, members, contributions } = data;
  if (!rounds.length) {
    return (
      <Card>
        <Text tone="muted" center>
          Lalabas ang timeline pagkatapos ng bunot. 🎲
        </Text>
      </Card>
    );
  }
  return (
    <Card padded={false}>
      {rounds.map((r, i) => {
        const rec = recipientsOf(r, members);
        const ks = contributions.filter((k) => k.round_id === r.id);
        const paid = ks.filter((k) => k.status === 'confirmed').length;
        const mine = r.slot_group === myGroup;
        const active = r.status === 'active';
        return (
          <PressableScale
            key={r.id}
            hapticOnPress={false}
            scaleTo={0.99}
            onPress={() => router.push(`/circle/${circle.id}/round/${r.id}`)}
            style={[
              styles.tlRow,
              { borderBottomColor: c.border, borderBottomWidth: i < rounds.length - 1 ? 1 : 0 },
              active && { backgroundColor: c.surfaceAlt },
            ]}>
            <View
              style={[
                styles.tlNum,
                {
                  backgroundColor: r.status === 'completed' ? c.success : active ? c.ink : c.surfaceAlt,
                },
              ]}>
              {r.status === 'completed' ? (
                <Feather name="check" size={16} color="#fff" />
              ) : (
                <Text variant="smallBold" color={active ? c.onInk : c.textMuted}>
                  {r.round_no}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyBold" numberOfLines={1}>
                {slotName(rec)} {mine ? '(Ikaw)' : ''}
              </Text>
              <Text variant="small" tone="muted">
                {shortDate(r.due_date)} · {paid}/{ks.length} bayad
              </Text>
            </View>
            {mine && r.status !== 'completed' ? <Chip label="Sahod mo" tone="accent" /> : active ? <Chip label="Ngayon" tone="ink" /> : null}
            <Feather name="chevron-right" size={18} color={c.textFaint} />
          </PressableScale>
        );
      })}
      <View style={{ padding: 14 }}>
        <Text variant="small" tone="faint" center>
          Bawat round: {peso(Number(circle.amount) * circle.slots)} sa may sahod
        </Text>
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------- Members
export function MembersList({ data, userId }: { data: CircleDetail; userId: string | null }) {
  const c = useColors();
  const current = data.rounds.find((r) => r.status === 'active');
  const slots = slotsOf(data.members);
  return (
    <Card padded={false}>
      {slots.map((s, i) => (
        <View key={s.group} style={[styles.slotRow, { borderBottomColor: c.border, borderBottomWidth: i < slots.length - 1 ? 1 : 0 }]}>
          <View style={[styles.tlNum, { backgroundColor: c.surfaceAlt }]}>
            <Text variant="smallBold" tone="muted">
              {s.slotNo ?? '•'}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            {s.members.map((m) => {
              const k = current && data.contributions.find((x) => x.round_id === current.id && x.member_id === m.id);
              return (
                <View key={m.id} style={styles.memberRow}>
                  <Avatar emoji={m.profiles?.avatar_emoji} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyBold" numberOfLines={1}>
                      {m.profiles?.full_name ?? 'Member'} {m.user_id === userId ? '(Ikaw)' : ''}
                    </Text>
                    <Text variant="small" tone="muted">
                      Tiwala {m.profiles?.tiwala_score ?? '—'}
                      {m.role === 'admin' ? ' · Admin' : ''}
                      {Number(m.share) === 0.5 ? ' · Hati' : ''}
                    </Text>
                  </View>
                  {k && !k.auto ? <StatusChip status={displayStatus(k, current!, data.circle)} /> : k?.auto ? <Chip label="Sahod" tone="accent" /> : null}
                </View>
              );
            })}
          </View>
        </View>
      ))}
      {slots.length < data.circle.slots && (
        <View style={{ padding: 16 }}>
          <Text variant="small" tone="faint" center>
            {data.circle.slots - slots.length} bakanteng slot pa
          </Text>
        </View>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Rules / Kasunduan
export function RulesPanel({ data }: { data: CircleDetail }) {
  const { lang } = usePrefs();
  const { circle, members } = data;
  const agreed = members.filter((m) => m.status === 'approved' && m.agreed_at);
  return (
    <>
      <Card style={{ gap: 10 }}>
        <Row label="Hulog kada slot" value={peso(circle.amount)} />
        <Row label="Sahod kada round" value={peso(Number(circle.amount) * circle.slots)} />
        <Row label="Schedule" value={frequencyLabel[circle.frequency][lang]} />
        <Row label="Simula" value={longDate(circle.start_date)} />
        <Row label="Late fee" value={peso(circle.late_fee)} />
        <Row label="Palugit" value={`${circle.grace_days} araw`} />
        <Row label="Pagkakasunod" value={circle.order_mode === 'draw' ? 'Digital Bunot' : 'Admin'} />
      </Card>
      <Card style={{ gap: 8 }}>
        <Text variant="h3">📜 Rules</Text>
        <Text>{circle.rules || 'Walang dagdag na rules.'}</Text>
      </Card>
      <Card style={{ gap: 8 }}>
        <Text variant="h3">✍️ Pumayag ({agreed.length})</Text>
        {agreed.map((m) => (
          <Text key={m.id} variant="small" tone="muted">
            {m.profiles?.full_name} — {new Date(m.agreed_at!).toLocaleString()}
          </Text>
        ))}
      </Card>
      {circle.seed && (
        <Button title="I-verify ang Digital Bunot" icon="shield" variant="secondary" onPress={() => router.push(`/circle/${circle.id}/draw`)} />
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text tone="muted">{label}</Text>
      <Text variant="bodyBold">{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- Forming progress
export function SlotsProgress({ data }: { data: CircleDetail }) {
  const c = useColors();
  const filled = data.members.filter((m) => m.status === 'approved').reduce((s, m) => s + Number(m.share), 0);
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="h3">Mga slot</Text>
        <Text variant="h3">
          {filled}/{data.circle.slots}
        </Text>
      </View>
      <ProgressBar progress={filled / data.circle.slots} color={c.ink} height={10} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {data.members
          .filter((m) => m.status === 'approved')
          .map((m: Member) => (
            <Chip key={m.id} label={`${m.profiles?.avatar_emoji ?? ''} ${firstName(m.profiles?.full_name)}`} />
          ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  qr: { alignSelf: 'center', padding: 20, borderRadius: radius.lg },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tlRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  tlNum: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  slotRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
});
