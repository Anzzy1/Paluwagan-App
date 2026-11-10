import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar, Chip, Input, Notice } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { confirmAction, notifyError } from '@/lib/alert';
import { useCircleAction, type CircleDetail } from '@/lib/api';
import { firstName, peso, timeAgo } from '@/lib/format';
import { useColors } from '@/lib/prefs';
import type { Member } from '@/lib/types';

const nameOf = (m?: Member) => m?.profiles?.full_name || 'Member';

/** What a member has paid in (their own money, not hulog the admin covered). */
const paidIn = (data: CircleDetail, memberId: string) =>
  data.contributions.filter((k) => k.member_id === memberId && k.status === 'confirmed' && !k.covered_by && !k.auto).reduce((s, k) => s + Number(k.amount), 0);

/** Has this member's slot already received its sahod? Then they can't leave (they still owe hulog). */
const gotSahod = (data: CircleDetail, m: Member) => data.rounds.some((r) => r.slot_group === m.slot_group && r.status === 'completed');

/**
 * Admin hand-over and leaving (0023):
 * - the member offered the admin role accepts or declines;
 * - the admin hands over the role (they can't leave while they're the admin);
 * - members ask the admin to leave (agreeing on a refund), or leave right away without one;
 * - the admin approves with the refund amount, or declines.
 */
export function MembershipPanel({ data, userId }: { data: CircleDetail; userId: string | null }) {
  const c = useColors();
  const { circle } = data;
  const action = useCircleAction(circle.id);
  const [handOpen, setHandOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const members = data.members.filter((m) => m.status === 'approved');
  const me = members.find((m) => m.user_id === userId);
  if (!me || circle.deleted_at) return null;
  const isAdmin = me.role === 'admin';
  const run = (fn: string, args: Record<string, unknown>, failed: string, done?: () => void) =>
    action.mutate({ fn, args }, { onSuccess: () => { haptic('success'); done?.(); }, onError: (e) => notifyError(e, failed) });

  const offeredTo = members.find((m) => m.user_id === circle.admin_offer_to);
  const offeredBy = data.members.find((m) => m.user_id === circle.admin_offer_by);
  const requests = isAdmin ? members.filter((m) => m.leave_requested_at && m.role !== 'admin') : [];
  const forcedLeft = isAdmin ? data.members.filter((m) => m.status === 'left' && m.left_forced && !m.left_reviewed_at) : [];
  const alone = members.length === 1;
  const leavable = circle.status === 'forming' || circle.status === 'active';
  const showSelf = circle.status !== 'completed';

  return (
    <>
      {/* Offered the admin role */}
      {circle.admin_offer_to === userId && (
        <Card style={{ gap: 10 }}>
          <View style={styles.titleRow}>
            <Feather name="shield" size={18} color={c.brand} />
            <Text variant="h3">Become the admin?</Text>
          </View>
          <Text variant="small" tone="muted">
            {firstName(nameOf(offeredBy))} wants to hand this paluwagan over to you. As admin you confirm payments, release each sahod and handle members. You still pay your hulog and get your sahod as usual.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Accept" icon="check" variant="brand" size="md" full={false} style={{ flex: 1 }} loading={action.isPending} onPress={() => run('answer_admin_offer', { p_circle: circle.id, p_accept: true }, 'Couldn’t accept')} />
            <Button title="Decline" variant="secondary" size="md" full={false} style={{ flex: 1 }} onPress={() => run('answer_admin_offer', { p_circle: circle.id, p_accept: false }, 'Couldn’t decline')} />
          </View>
        </Card>
      )}

      {/* Admin: leave requests */}
      {requests.map((m) => (
        <LeaveRequestCard key={m.id} data={data} member={m} />
      ))}
      {forcedLeft.map((m) => (
        <ForcedLeaveCard key={m.id} data={data} member={m} />
      ))}

      {showSelf && (
        <Card style={{ gap: 10 }}>
          <Text variant="h3">{isAdmin ? 'Admin role' : 'Your membership'}</Text>
          {isAdmin ? (
            offeredTo ? (
              <>
                <Text variant="small" tone="muted">
                  Waiting for {nameOf(offeredTo)} to accept the admin role. Until then, you’re still the admin.
                </Text>
                <Button title="Cancel hand-over" variant="secondary" size="md" onPress={() => run('cancel_admin_offer', { p_circle: circle.id }, 'Couldn’t cancel')} />
              </>
            ) : alone ? (
              <>
                <Text variant="small" tone="muted">
                  You’re the only member left. If you leave, the paluwagan is deleted. You can still restore it from your Deleted history.
                </Text>
                <Button
                  title="Leave and delete paluwagan"
                  icon="trash-2"
                  variant="ghost"
                  size="md"
                  onPress={() =>
                    confirmAction(
                      'Leave and delete this paluwagan?',
                      'You’re the last member, so leaving deletes it. You can restore it from your Deleted history.',
                      () => run('force_leave', { p_circle: circle.id }, 'Couldn’t leave'),
                      { confirmText: 'Leave and delete', destructive: true },
                    )
                  }
                />
              </>
            ) : (
              <>
                <Text variant="small" tone="muted">
                  The admin can’t leave. To step down or leave, hand the role to another member first. Once they accept, you become a regular member (you keep your hulog and sahod).
                </Text>
                <Button title="Hand over admin" icon="shield" variant="secondary" size="md" disabled={members.length < 2} onPress={() => setHandOpen(true)} />
              </>
            )
          ) : me.leave_requested_at ? (
            <>
              <Text variant="small" tone="muted">
                You asked the admin to leave {timeAgo(me.leave_requested_at)}
                {me.leave_reason ? ` (“${me.leave_reason}”)` : ''}. Talk about your refund in the chat; the admin approves it here.
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                <Button title="Cancel request" variant="secondary" size="md" full={false} style={{ flex: 1 }} onPress={() => run('cancel_leave', { p_circle: circle.id }, 'Couldn’t cancel')} />
                <Button title="Leave without refund" variant="ghost" size="md" full={false} style={{ flex: 1 }} onPress={() => setLeaveOpen(true)} />
              </View>
            </>
          ) : leavable && gotSahod(data, me) ? (
            <Text variant="small" tone="muted">
              You already received your sahod, so you need to finish your hulog. If you really can’t continue, talk to the admin about a replacement.
            </Text>
          ) : leavable ? (
            <Button title="Leave paluwagan" icon="log-out" variant="ghost" size="md" onPress={() => setLeaveOpen(true)} />
          ) : (
            <Text variant="small" tone="muted">
              {circle.status === 'locked' ? 'The draw is about to happen. Ask the admin to unlock it if you need to leave.' : 'You can’t leave right now.'}
            </Text>
          )}
        </Card>
      )}

      <HandOverSheet open={handOpen} onClose={() => setHandOpen(false)} data={data} candidates={members.filter((m) => m.user_id !== userId)} />
      <LeaveSheet open={leaveOpen} onClose={() => setLeaveOpen(false)} data={data} me={me} />
    </>
  );
}

function HandOverSheet({ open, onClose, data, candidates }: { open: boolean; onClose: () => void; data: CircleDetail; candidates: Member[] }) {
  const c = useColors();
  const action = useCircleAction(data.circle.id);
  const [pick, setPick] = useState<string | null>(null);
  const chosen = candidates.find((m) => m.user_id === pick);
  return (
    <Sheet open={open} onClose={onClose} title="Hand over admin" subtitle="Pick who takes over. They need to accept before anything changes.">
      <Card padded={false}>
        {candidates.map((m, i) => (
          <PressableScale key={m.id} hapticOnPress={false} onPress={() => setPick(m.user_id)} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }, pick === m.user_id && { backgroundColor: c.surfaceAlt }]}>
            <Avatar name={m.profiles?.full_name} seed={m.user_id} uri={m.profiles?.avatar_url} size={34} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyBold" numberOfLines={1}>
                {nameOf(m)}
              </Text>
              <Text variant="caption" tone="faint">
                Trust Score {m.profiles?.tiwala_score ?? '—'}
              </Text>
            </View>
            <Feather name={pick === m.user_id ? 'check-circle' : 'circle'} size={20} color={pick === m.user_id ? c.brand : c.borderStrong} />
          </PressableScale>
        ))}
      </Card>
      <Text variant="small" tone="muted">
        They’ll see it in their notifications. After they accept you’re a regular member, and you can leave if you want to.
      </Text>
      <Button
        title={chosen ? `Offer to ${firstName(nameOf(chosen))}` : 'Pick a member'}
        icon="shield"
        disabled={!chosen}
        loading={action.isPending}
        onPress={() =>
          action.mutate(
            { fn: 'offer_admin', args: { p_circle: data.circle.id, p_user: pick } },
            { onSuccess: () => { haptic('success'); onClose(); }, onError: (e) => notifyError(e, 'Couldn’t offer the role') },
          )
        }
      />
    </Sheet>
  );
}

function LeaveSheet({ open, onClose, data, me }: { open: boolean; onClose: () => void; data: CircleDetail; me: Member }) {
  const action = useCircleAction(data.circle.id);
  const [reason, setReason] = useState('');
  const paid = paidIn(data, me.id);
  const active = data.circle.status === 'active';
  const others = data.members.filter((m) => m.status === 'approved' && m.id !== me.id).length;
  const done = () => {
    haptic('success');
    onClose();
  };
  const ask = () =>
    action.mutate({ fn: 'request_leave', args: { p_circle: data.circle.id, p_reason: reason } }, { onSuccess: done, onError: (e) => notifyError(e, 'Couldn’t send your request') });
  const force = () =>
    confirmAction(
      'Leave without a refund?',
      `${paid > 0 ? `You’ve paid ${peso(paid)}. You won’t get it back: it’s split among the ${others} members who stay (${peso(Math.round((paid / Math.max(others, 1)) * 100) / 100)} each). ` : ''}You leave right away${active ? ' and your slot opens for a replacement' : ''}. This can’t be undone.`,
      () => action.mutate({ fn: 'force_leave', args: { p_circle: data.circle.id } }, { onSuccess: done, onError: (e) => notifyError(e, 'Couldn’t leave') }),
      { confirmText: 'Leave now', destructive: true },
    );
  return (
    <Sheet open={open} onClose={onClose} title="Leave paluwagan" subtitle={`You’ve paid ${peso(paid)} so far.`}>
      {!me.leave_requested_at && (
        <>
          <Notice
            tone="info"
            icon="message-circle"
            title="Ask the admin first"
            body={`The admin decides with you how much of your ${peso(paid)} you get back. Talk it over in the group chat; the admin records the refund when approving. Anything you don’t take back is split among the members who stay.${active ? ' Your slot then opens for a replacement.' : ''}`}
          />
          <Input label="Reason (optional)" placeholder="e.g. Moving abroad" value={reason} onChangeText={setReason} maxLength={200} />
          <Button title="Ask the admin to leave" icon="send" loading={action.isPending} onPress={ask} />
        </>
      )}
      <Button title="Leave now without a refund" icon="log-out" variant="ghost" onPress={force} />
    </Sheet>
  );
}

function LeaveRequestCard({ data, member }: { data: CircleDetail; member: Member }) {
  const c = useColors();
  const action = useCircleAction(data.circle.id);
  const paid = paidIn(data, member.id);
  const [refund, setRefund] = useState(String(paid));
  const n = Number(refund);
  const ok = refund.trim() !== '' && n >= 0;
  const rest = Math.max(paid - (n || 0), 0);
  const stay = data.members.filter((m) => m.status === 'approved' && m.id !== member.id).length;
  const each = stay > 0 ? Math.round((rest / stay) * 100) / 100 : 0;
  const splitText = rest > 0 && stay > 0 ? ` The other ${peso(rest)} is split among the ${stay} members who stay (${peso(each)} each).` : '';
  const approve = () =>
    confirmAction(
      `Let ${firstName(nameOf(member))} leave?`,
      `${n > 0 ? `Record a ${peso(n)} refund (taken out of the fund). Hand it over yourself.` : 'No refund.'}${splitText}${data.circle.status === 'active' ? ' Their slot opens for a replacement.' : ''}`,
      () =>
        action.mutate(
          { fn: 'approve_leave', args: { p_member: member.id, p_refund: n } },
          { onSuccess: () => haptic('success'), onError: (e) => notifyError(e, 'Couldn’t approve') },
        ),
      { confirmText: 'Approve', icon: 'log-out' },
    );
  const decline = () =>
    confirmAction(`Decline ${firstName(nameOf(member))}’s request?`, 'They stay in the paluwagan. Talk it over in the chat.', () =>
      action.mutate({ fn: 'decline_leave', args: { p_member: member.id, p_note: null } }, { onError: (e) => notifyError(e, 'Couldn’t decline') }),
    );
  return (
    <Card style={{ gap: 10, borderWidth: 1, borderColor: c.warning }}>
      <View style={styles.titleRow}>
        <Avatar name={member.profiles?.full_name} seed={member.user_id} uri={member.profiles?.avatar_url} size={34} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyBold">{nameOf(member)} wants to leave</Text>
          <Text variant="caption" tone="faint">
            {timeAgo(member.leave_requested_at!)}
            {member.leave_reason ? ` · “${member.leave_reason}”` : ''}
          </Text>
        </View>
        <Chip label={`Paid ${peso(paid)}`} tone="neutral" />
      </View>
      <Input label="Refund you agreed on" prefix="₱" value={refund} onChangeText={(v) => setRefund(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" hint={rest > 0 && stay > 0 ? `${peso(rest)} not taken back is split: ${peso(each)} each to ${stay} members` : '0 if they’re not taking anything back'} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Approve" icon="check" variant="brand" size="md" full={false} style={{ flex: 1 }} disabled={!ok} loading={action.isPending} onPress={approve} />
        <Button title="Decline" variant="secondary" size="md" full={false} style={{ flex: 1 }} onPress={decline} />
      </View>
    </Card>
  );
}

/** Admin: someone left without a refund. By default what they paid in is split; keep it or change it (0025). */
function ForcedLeaveCard({ data, member }: { data: CircleDetail; member: Member }) {
  const c = useColors();
  const action = useCircleAction(data.circle.id);
  const paid = paidIn(data, member.id);
  const split = (data.adjustments ?? []).find((a) => a.kind === 'split' && a.user_id === member.user_id && !!member.left_at && a.created_at >= member.left_at);
  const current = split ? Number(split.amount) : 0;
  const count = split?.split_count ?? data.members.filter((m) => m.status === 'approved').length;
  const [value, setValue] = useState(String(current));
  const n = Number(value);
  const ok = value.trim() !== '' && n >= 0 && n <= paid;
  const each = count > 0 ? Math.round((n / count) * 100) / 100 : 0;
  const save = (amount: number) =>
    action.mutate(
      { fn: 'review_left', args: { p_member: member.id, p_split: amount } },
      { onSuccess: () => haptic('success'), onError: (e) => notifyError(e, 'Couldn’t save') },
    );
  return (
    <Card style={{ gap: 10, borderWidth: 1, borderColor: c.warning }}>
      <View style={styles.titleRow}>
        <Avatar name={member.profiles?.full_name} seed={member.user_id} uri={member.profiles?.avatar_url} size={34} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyBold">{nameOf(member)} left without a refund</Text>
          <Text variant="caption" tone="faint">
            {member.left_at ? timeAgo(member.left_at) : ''}
          </Text>
        </View>
        <Chip label={`Paid ${peso(paid)}`} tone="neutral" />
      </View>
      {paid > 0 ? (
        <>
          <Text variant="small" tone="muted">
            What they paid in stays in the paluwagan and is split among the {count} members, taken out of what’s been collected. Change it if you agreed on something else (for example, giving part of it back).
          </Text>
          <Input
            label="Amount split among the members"
            prefix="₱"
            value={value}
            onChangeText={(v) => setValue(v.replace(/[^\d.]/g, ''))}
            keyboardType="decimal-pad"
            hint={n > paid ? `They only paid in ${peso(paid)}` : n > 0 ? `${peso(each)} each to ${count} members` : 'Nothing is split'}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title={`Keep ${peso(current)} split`} icon="check" variant="brand" size="md" full={false} style={{ flex: 1.3 }} loading={action.isPending} onPress={() => save(current)} />
            <Button title="Save change" variant="secondary" size="md" full={false} style={{ flex: 1 }} disabled={!ok || n === current} onPress={() => save(n)} />
          </View>
        </>
      ) : (
        <>
          <Text variant="small" tone="muted">
            They hadn’t paid anything in yet, so there’s nothing to split.
          </Text>
          <Button title="Got it" icon="check" variant="secondary" size="md" loading={action.isPending} onPress={() => save(0)} />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
});
