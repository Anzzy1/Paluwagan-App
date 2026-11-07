import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Avatar, AvatarStack, Chip, Input, ProgressBar, StatusChip } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { notifyError } from '@/lib/alert';
import { useCircleAction, useSetCirclePassword, type CircleDetail } from '@/lib/api';
import { plannedHulogPerSahod, recipientsOf } from '@/lib/derive';
import { dateTime, displayStatus, longDate, payoutOf, peso, scheduleLabel, shortDate, slotName, slotsOf } from '@/lib/format';
import { useColors } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

const onErr = (e: unknown) => notifyError(e);

// ---------------------------------------------------------------- Invite
export function InvitePanel({ circle, isAdmin }: { circle: Pick<CircleDetail['circle'], 'id' | 'invite_code' | 'name' | 'has_password'>; isAdmin: boolean }) {
  const c = useColors();
  const { invite_code: code, name } = circle;
  const [qr, setQr] = useState(false);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState('');
  const setPassword = useSetCirclePassword(circle.id);
  const link = Linking.createURL('/join', { queryParams: { code } });
  // The password is never part of the invite: members get it from the admin separately.
  const share = () =>
    Share.share({
      message: `Join "${name}" on Paluwagan.\n\nInvite code: ${code}\n${link}${circle.has_password ? '\n\nYou’ll need the circle password: ask me for it.' : ''}`,
    });
  const copy = async (what: 'code' | 'link') => {
    await Clipboard.setStringAsync(what === 'code' ? code : link);
    haptic('success');
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };
  const savePw = (value: string) =>
    setPassword.mutate(value, {
      onSuccess: () => {
        haptic('success');
        setPwOpen(false);
        setPw('');
      },
      onError: onErr,
    });

  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="h3">Invite members</Text>
        <Chip label={circle.has_password ? 'Password protected' : 'No password'} icon={circle.has_password ? 'lock' : 'unlock'} tone={circle.has_password ? 'brand' : 'warning'} />
      </View>
      <View style={[styles.codeBox, { backgroundColor: c.surfaceAlt }]}>
        <Text variant="display" style={{ letterSpacing: 6, fontVariant: ['tabular-nums'] }}>
          {code}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <PressableScale onPress={() => copy('code')} accessibilityLabel="Copy code" style={[styles.square, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Feather name={copied === 'code' ? 'check' : 'copy'} size={16} color={copied === 'code' ? c.success : c.text} />
          </PressableScale>
          <PressableScale onPress={() => setQr(true)} accessibilityLabel="Show QR" style={[styles.square, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Feather name="grid" size={16} color={c.text} />
          </PressableScale>
        </View>
      </View>
      <PressableScale onPress={() => copy('link')} hapticOnPress={false} style={[styles.linkRow, { backgroundColor: c.surfaceAlt }]}>
        <Feather name="link" size={15} color={c.brand} />
        <Text variant="small" numberOfLines={1} style={{ flex: 1 }}>
          {link}
        </Text>
        <Text variant="smallBold" tone={copied === 'link' ? 'success' : 'brand'}>
          {copied === 'link' ? 'Copied' : 'Copy link'}
        </Text>
      </PressableScale>
      <Button title="Share invite" icon="share-2" size="md" variant="secondary" onPress={share} />
      {isAdmin && (
        <PressableScale onPress={() => setPwOpen(true)} hapticOnPress={false} style={[styles.linkRow, { backgroundColor: circle.has_password ? c.brandSoft : c.warningBg }]}>
          <Feather name="lock" size={15} color={circle.has_password ? c.brand : c.warning} />
          <Text variant="small" style={{ flex: 1 }} color={circle.has_password ? c.text : c.warning}>
            {circle.has_password ? 'Members need the password to join.' : 'Anyone with the code can request to join. Add a password.'}
          </Text>
          <Text variant="smallBold" color={circle.has_password ? c.brand : c.warning}>
            {circle.has_password ? 'Change' : 'Set'}
          </Text>
        </PressableScale>
      )}
      <Sheet open={qr} onClose={() => setQr(false)} title="Scan to join" subtitle={name}>
        <View style={[styles.qr, { backgroundColor: '#fff', borderColor: c.border }]}>
          <QRCode value={link} size={200} />
        </View>
        <Text variant="h1" center style={{ letterSpacing: 6 }}>
          {code}
        </Text>
        {circle.has_password && (
          <Text variant="small" tone="muted" center>
            Members will also need the circle password.
          </Text>
        )}
      </Sheet>
      <Sheet open={pwOpen} onClose={() => setPwOpen(false)} title={circle.has_password ? 'Change join password' : 'Set a join password'} subtitle="New members must enter it to send a join request. Existing members aren’t affected.">
        <Input placeholder="At least 4 characters" value={pw} onChangeText={(v) => setPw(v.slice(0, 64))} autoCapitalize="none" autoCorrect={false} autoFocus />
        <Button title="Save password" icon="lock" onPress={() => savePw(pw)} disabled={pw.length < 4} loading={setPassword.isPending} />
        {circle.has_password && <Button title="Remove password" variant="danger" onPress={() => savePw('')} loading={setPassword.isPending} />}
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
        <Card padded={false}>
          <View style={styles.cardHead}>
            <Text variant="h3">Join requests</Text>
            <Chip label={String(pending.length)} tone="info" />
          </View>
          {pending.map((m) => (
            <View key={m.id} style={[styles.listRow, { borderTopColor: c.border }]}>
              <Avatar name={m.profiles?.full_name} seed={m.user_id} uri={m.profiles?.avatar_url} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyBold">{m.profiles?.full_name ?? 'Member'}</Text>
                <Text variant="small" tone="muted">
                  Trust Score {m.profiles?.tiwala_score ?? '—'}
                  {Number(m.share) === 0.5 ? ' · Split slot' : ''}
                </Text>
              </View>
              <Button
                title="Decline"
                size="sm"
                variant="secondary"
                full={false}
                onPress={() => action.mutate({ fn: 'review_member', args: { p_member: m.id, p_approve: false } }, { onError: onErr })}
              />
              <Button
                title="Approve"
                size="sm"
                full={false}
                onPress={() => action.mutate({ fn: 'review_member', args: { p_member: m.id, p_approve: true } }, { onError: onErr })}
              />
            </View>
          ))}
        </Card>
      )}

      {unpaired.length > 0 && (
        <Card style={{ gap: 10 }}>
          <Text variant="h3">Pair split slots</Text>
          <Text variant="small" tone="muted">
            Select two split-slot members to combine them into one slot.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {unpaired.map((m) => (
              <PressableScale
                key={m.id}
                hapticOnPress={false}
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

// ---------------------------------------------------------------- Schedule / timeline
export function Timeline({ data, myGroup }: { data: CircleDetail; myGroup?: string }) {
  const c = useColors();
  const { circle, rounds, members, contributions } = data;
  if (!rounds.length) {
    return (
      <Card>
        <Text tone="muted" center>
          The payout schedule appears after the draw.
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
            scaleTo={0.995}
            onPress={() => router.push(`/circle/${circle.id}/round/${r.id}`)}
            style={[styles.tlRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }, active && { backgroundColor: c.surfaceAlt }]}>
            <View style={[styles.num, { backgroundColor: r.status === 'completed' ? c.successBg : active ? c.ink : c.surfaceAlt }]}>
              {r.status === 'completed' ? (
                <Feather name="check" size={14} color={c.success} />
              ) : (
                <Text variant="smallBold" color={active ? c.onInk : c.textMuted}>
                  {r.round_no}
                </Text>
              )}
            </View>
            <AvatarStack people={rec.map((m) => ({ id: m.user_id, name: m.profiles?.full_name, uri: m.profiles?.avatar_url }))} size={28} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyBold" numberOfLines={1}>
                {slotName(rec)}
                {mine ? ' (you)' : ''}
              </Text>
              <Text variant="small" tone="muted">
                Sahod {shortDate(r.due_date)} · {paid}/{ks.length} paid
              </Text>
            </View>
            {mine && r.status !== 'completed' ? <Chip label="Your payout" tone="brand" /> : active ? <Chip label="Current" tone="ink" /> : null}
            <Feather name="chevron-right" size={16} color={c.textFaint} />
          </PressableScale>
        );
      })}
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
      <View style={styles.cardHead}>
        <Text variant="h3">Members</Text>
        <Text variant="small" tone="muted">
          {slots.length}/{data.circle.slots} slots
        </Text>
      </View>
      {slots.map((s) => (
        <View key={s.group} style={[styles.slotRow, { borderTopColor: c.border }]}>
          <Text variant="smallBold" tone="faint" style={{ width: 22, paddingTop: 8 }}>
            {s.slotNo ? `#${s.slotNo}` : '•'}
          </Text>
          <View style={{ flex: 1, gap: 10 }}>
            {s.members.map((m) => {
              const k = current && data.contributions.find((x) => x.round_id === current.id && x.member_id === m.id);
              return (
                <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Avatar name={m.profiles?.full_name} seed={m.user_id} uri={m.profiles?.avatar_url} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyBold" numberOfLines={1}>
                      {m.profiles?.full_name ?? 'Member'}
                      {m.user_id === userId ? ' (you)' : ''}
                    </Text>
                    <Text variant="small" tone="muted">
                      Trust {m.profiles?.tiwala_score ?? '—'}
                      {m.role === 'admin' ? ' · Admin' : ''}
                      {Number(m.share) === 0.5 ? ' · Split' : ''}
                    </Text>
                  </View>
                  {k && !k.auto ? <StatusChip status={displayStatus(k, current!, data.circle)} /> : k?.auto ? <Chip label="Recipient" tone="brand" /> : null}
                </View>
              );
            })}
          </View>
        </View>
      ))}
      {slots.length < data.circle.slots && (
        <View style={[styles.slotRow, { borderTopColor: c.border }]}>
          <Text variant="small" tone="faint">
            {data.circle.slots - slots.length} open {data.circle.slots - slots.length === 1 ? 'slot' : 'slots'}
          </Text>
        </View>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Agreement
export function RulesPanel({ data }: { data: CircleDetail }) {
  const c = useColors();
  const { circle, members } = data;
  const agreed = members.filter((m) => m.status === 'approved' && m.agreed_at);
  return (
    <>
      <Card style={{ gap: 12 }}>
        <Text variant="h3">Terms</Text>
        <Row label="Contribution" value={peso(circle.amount)} />
        <Row label="Per sahod" value={peso(Number(circle.amount) * circle.slots * plannedHulogPerSahod(circle))} />
        <Row label="Hulog" value={scheduleLabel(circle)} />
        <Row label="Sahod" value={payoutOf(circle) ? scheduleLabel(payoutOf(circle)!) : 'Every hulog date'} />
        <Row label="First hulog" value={longDate(circle.start_date)} />
        {circle.first_payout_date && <Row label="First sahod" value={longDate(circle.first_payout_date)} />}
        <Row label="Late fee" value={peso(circle.late_fee)} />
        <Row label="Grace period" value={`${circle.grace_days} day${circle.grace_days === 1 ? '' : 's'}`} />
        <Row label="Payout order" value={circle.order_mode === 'draw' ? 'Verifiable draw' : 'Set by admin'} />
      </Card>
      <Card style={{ gap: 8 }}>
        <Text variant="h3">Agreement</Text>
        <Text variant="small" tone="muted" style={{ lineHeight: 20 }}>
          {circle.rules || 'No additional rules.'}
        </Text>
      </Card>
      <Card padded={false}>
        <View style={styles.cardHead}>
          <Text variant="h3">Signed by</Text>
          <Text variant="small" tone="muted">
            {agreed.length} members
          </Text>
        </View>
        {agreed.map((m) => (
          <View key={m.id} style={[styles.listRow, { borderTopColor: c.border }]}>
            <Feather name="check-circle" size={16} color={c.success} />
            <Text variant="bodyMedium" style={{ flex: 1 }}>
              {m.profiles?.full_name}
            </Text>
            <Text variant="small" tone="faint">
              {dateTime(m.agreed_at!)}
            </Text>
          </View>
        ))}
      </Card>
      {circle.seed && <Button title="Verify the draw" icon="shield" variant="secondary" onPress={() => router.push(`/circle/${circle.id}/draw`)} />}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text tone="muted">{label}</Text>
      <Text variant="bodyMedium" style={{ textAlign: 'right', flexShrink: 1 }}>
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------- Forming progress
export function SlotsProgress({ data }: { data: CircleDetail }) {
  const approved = data.members.filter((m) => m.status === 'approved');
  const filled = approved.reduce((s, m) => s + Number(m.share), 0);
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="h3">Slots filled</Text>
        <Text variant="money">
          {filled} / {data.circle.slots}
        </Text>
      </View>
      <ProgressBar progress={filled / data.circle.slots} height={8} />
      <AvatarStack people={approved.map((m) => ({ id: m.user_id, name: m.profiles?.full_name, uri: m.profiles?.avatar_url }))} size={30} />
    </Card>
  );
}

const styles = StyleSheet.create({
  codeBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: radius.md },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.md },
  square: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  qr: { alignSelf: 'center', padding: 16, borderRadius: radius.lg, borderWidth: 1 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  tlRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  num: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  slotRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
});
