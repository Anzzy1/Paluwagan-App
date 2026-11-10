import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ActivityList } from '@/components/ActivityList';
import { AdvanceSahodSheet } from '@/components/circle/AdvanceSahodSheet';
import { DelaySahodSheet } from '@/components/circle/DelaySahodSheet';
import { SahodBalances } from '@/components/circle/SahodBalances';
import { HulogChecklist } from '@/components/circle/HulogChecklist';
import { FormingAdmin, InvitePanel, MembersList, ReplacementAdmin, RulesPanel, SlotsProgress, Timeline } from '@/components/circle/panels';
import { DeleteCircleButton, DeletedPanel, PauseCircleButton, PausedPanel } from '@/components/circle/Lifecycle';
import { AdjustmentLines, DeductionSheet } from '@/components/circle/Deductions';
import { FundGives } from '@/components/circle/FundGives';
import { MembershipPanel } from '@/components/circle/MembershipPanel';
import { PayInfoCard, PayInfoSheet } from '@/components/circle/PayInfo';
import { PaySheet } from '@/components/circle/PaySheet';
import { RepeatPanel } from '@/components/circle/RepeatPanel';
import { Notice, ProgressBar, PurposeIcon, Segmented } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card, useTint } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { Columns, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { confirmAction, notifyError } from '@/lib/alert';
import { useActivity, useCircle, useCircleAction } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { unreadCount, useChatRead, useCircleChat } from '@/lib/chat';
import { dueOf, hulogInRound, isRevealed, myNextContribution, plannedHulogPerSahod, recipientsOf, unpaid } from '@/lib/derive';
import type { Contribution, Member } from '@/lib/types';
import { daysUntil, firstName, longDate, payoutShort, peso, potOf, relativeDue, slotName, timeAgo, todayISO } from '@/lib/format';
import { useColors, useIsDesktop, useT } from '@/lib/prefs';
import { radius } from '@/theme/tokens';
import { withAccount } from '@/components/AccountGate';

type Tab = 'timeline' | 'members' | 'rules' | 'activity';

/** Fewest people a paluwagan can lock with (matches lock_circle, migration 0012). */
const MIN_TO_LOCK = 3;

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: 120, gap: 2 }}>
      <Text variant="overline" color="rgba(255,255,255,0.75)">
        {label}
      </Text>
      <Text variant="h2" color="#fff" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}

/** Opens the paluwagan's group chat; shows the latest message and how many are unread. */
function ChatEntry({ circleId, userId, members }: { circleId: string; userId: string | null; members: Member[] }) {
  const c = useColors();
  const chat = useCircleChat(circleId);
  const { lastRead } = useChatRead(circleId);
  const unread = unreadCount(chat.data, lastRead, userId);
  const latest = chat.data?.[chat.data.length - 1];
  return (
    <PressableScale onPress={() => router.push(`/circle/${circleId}/chat`)} hapticOnPress={false} scaleTo={0.99} accessibilityLabel={unread ? `Group chat, ${unread} unread` : 'Group chat'}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[styles.chatIcon, { backgroundColor: c.brandSoft }]}>
          <Feather name="message-circle" size={20} color={c.brand} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="bodyBold">Group chat</Text>
          {latest ? (
            // Messenger-style preview: who sent the last message, what they said, and when.
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Text variant="small" tone={unread ? 'default' : 'muted'} numberOfLines={1} style={{ flexShrink: 1 }}>
                <Text variant={unread ? 'smallBold' : 'small'} tone={unread ? 'default' : 'muted'}>
                  {latest.user_id === userId ? 'You' : firstName(members.find((m) => m.user_id === latest.user_id)?.profiles?.full_name ?? 'Former member')}:{' '}
                </Text>
                {latest.body}
              </Text>
              <Text variant="small" tone="faint">
                · {timeAgo(latest.created_at)}
              </Text>
            </View>
          ) : (
            <Text variant="small" tone="muted" numberOfLines={1}>
              Talk with the members of this paluwagan
            </Text>
          )}
        </View>
        {unread > 0 && (
          <View style={[styles.unread, { backgroundColor: c.danger }]}>
            <Text variant="caption" color="#fff" style={{ fontWeight: '800' }}>
              {unread > 99 ? '99+' : unread}
            </Text>
          </View>
        )}
        <Feather name="chevron-right" size={18} color={c.textFaint} />
      </Card>
    </PressableScale>
  );
}

function CircleScreenScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const c = useColors();
  const desktop = useIsDesktop();
  const { userId } = useAuth();
  const q = useCircle(id);
  const activity = useActivity(id);
  const action = useCircleAction(id);
  const [tab, setTab] = useState<Tab>('timeline');
  const [payOpen, setPayOpen] = useState(false);
  const [delayOpen, setDelayOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [deductOpen, setDeductOpen] = useState(false);
  const [payInfoOpen, setPayInfoOpen] = useState(false);
  /** A hulog picked from the checklist to pay (defaults to my next one). */
  const [payK, setPayK] = useState<Contribution | null>(null);
  const tint = useTint(q.data?.circle.color);

  if (q.isPending) {
    return (
      <Screen back>
        <ActivityIndicator style={{ marginTop: 80 }} />
      </Screen>
    );
  }
  if (q.error || !q.data) {
    return (
      <Screen back title="Paluwagan unavailable">
        <Text tone="muted">You don’t have access to this paluwagan, or it no longer exists.</Text>
      </Screen>
    );
  }

  // Until the draw is revealed, hide turns, rounds and dues (nobody pays before the order is declared).
  const revealed = isRevealed(q.data.circle);
  const data = revealed
    ? q.data
    : { ...q.data, rounds: [], contributions: [], members: q.data.members.map((m) => ({ ...m, slot_no: null })) };
  const { circle, members, rounds, contributions } = data;
  // Bunot ulit: allowed until someone has paid (checked on the full data, not the hidden view).
  const anyonePaid = q.data.contributions.some((k) => !k.auto && (k.status === 'submitted' || k.status === 'confirmed'));
  const me = members.find((m) => m.user_id === userId);
  const isAdmin = me?.role === 'admin';
  const current = rounds.find((r) => r.status === 'active');
  const recipients = recipientsOf(current, members);
  // Members pay the admin, who confirms payments and releases each sahod (0018).
  const admins = members.filter((m) => m.role === 'admin' && m.status === 'approved');
  const iAmRecipient = !!current && me?.slot_group === current.slot_group;
  // My next hulog: one still running for an advanced sahod comes first (its dates are earlier), else this round's.
  const myUnpaid = me ? unpaid(contributions.filter((k) => k.member_id === me.id), rounds) : [];
  const myK = myUnpaid.find((x) => x.round.status === 'completed' && x.due >= todayISO())?.k ?? myNextContribution(contributions, current, me?.id);
  const roundKs = current ? contributions.filter((k) => k.round_id === current.id) : [];
  const confirmed = roundKs.filter((k) => k.status === 'confirmed');
  const collected = confirmed.reduce((s, k) => s + Number(k.amount), 0);
  // Deductions and refunds taken out of this round's fund (0023).
  const roundAdj = current ? (data.adjustments ?? []).filter((a) => a.round_id === current.id) : [];
  const roundAdjTotal = roundAdj.reduce((s, a) => s + Number(a.amount), 0);
  const openSwaps = data.swaps.filter((s) => s.status === 'pending' || s.status === 'accepted').length;
  const approvedMembers = members.filter((m) => m.status === 'approved');
  /** People who joined (a head count). */
  const joined = approvedMembers.length;
  const completedRounds = rounds.filter((r) => r.status === 'completed').length;
  // No fixed size: the admin locks once 3 people have joined.
  const lockable = joined >= MIN_TO_LOCK;
  const unpaidKs = roundKs.filter((k) => k.status !== 'confirmed');
  const perRound = current ? hulogInRound(contributions, current) : 1;
  // The round's own hulog (stays right after someone leaves and the paluwagan is recalculated).
  const roundPot = roundKs.length ? roundKs.reduce((s, k) => s + Number(k.amount), 0) : potOf(circle) * perRound;
  // Today's hulog, for rounds that collect several (e.g. daily hulog, weekly sahod).
  const today = todayISO();
  const todayKs = current ? roundKs.filter((k) => dueOf(k, current) === today) : [];
  const todayPaid = todayKs.filter((k) => k.status === 'confirmed');
  // Every payment waiting for the admin, this round or overdue ones from earlier rounds.
  const toConfirm = contributions.filter((k) => k.status === 'submitted');
  // The admin releases the sahod on its date, or earlier once everyone has paid (0018).
  const canRelease = isAdmin && !!current && !circle.paused_at && (daysUntil(current.due_date) <= 0 || unpaidKs.length === 0);
  // My hulog left unpaid in rounds that were already released, and only once their date has passed
  // (an advance sahod releases a round before its hulog dates, and those aren't overdue yet).
  const myOverdue = myUnpaid.filter((x) => x.round.status === 'completed' && x.due < today);
  const overdueTotal = myOverdue.reduce((s, x) => s + Number(x.k.amount), 0);

  const release = () =>
    current &&
    confirmAction(
      `Release ${peso(collected - roundAdjTotal)} to ${iAmRecipient ? 'yourself' : slotName(recipients)}?`,
      `${iAmRecipient ? 'You are' : `${slotName(recipients)} is`} the recipient for round ${current.round_no}. Everyone will see who received this sahod.${
        unpaidKs.length
          ? ` ${unpaidKs.length} hulog (${peso(unpaidKs.reduce((s, k) => s + Number(k.amount), 0))}) are still unpaid; they stay on record as overdue, can still be paid later, and count against those members’ Trust Score.`
          : ''
      }${current.round_no < rounds.length ? ` The paluwagan then moves to round ${current.round_no + 1}.` : ' This is the last round.'}`,
      () => action.mutate({ fn: 'release_round', args: { p_circle: id } }, { onError: (e) => notifyError(e) }),
      { confirmText: 'Release sahod' },
    );

  /** Release the sahod early with the amount actually given and the day hulog continues (0021). */
  const advance = (given: number, resume: string | null) =>
    action.mutate(
      { fn: 'advance_sahod', args: { p_circle: id, p_given: given, p_resume: resume } },
      { onSuccess: () => setAdvanceOpen(false), onError: (e) => notifyError(e, 'Couldn’t advance the sahod') },
    );
  // Full sahod for this round, and where hulog continues after an advance: the next date nobody has paid yet.
  const roundTotal = roundKs.reduce((s, k) => s + Number(k.amount), 0);
  const resumeAnchor = (() => {
    const byDate = new Map<string, boolean>();
    for (const k of contributions) {
      const r = rounds.find((x) => x.id === k.round_id);
      if (!r) continue;
      const d = dueOf(k, r);
      if (d < today) continue;
      byDate.set(d, (byDate.get(d) ?? false) || k.status === 'submitted' || k.status === 'confirmed');
    }
    return [...byDate.entries()].filter(([, paid]) => !paid).map(([d]) => d).sort()[0] ?? null;
  })();
  const lastRound = rounds[rounds.length - 1];

  const run = (title: string, msg: string, fn: string, confirmText: string) =>
    confirmAction(title, msg, () => action.mutate({ fn, args: { p_circle: id } }, { onError: (e) => notifyError(e) }), { confirmText });

  // ---------------- hero
  const hero = (
    <LinearGradient colors={tint.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={[styles.heroDeco, { right: -50, top: -70 }]} />
      <View style={[styles.heroDeco, { right: 120, bottom: -120, width: 200, height: 200 }]} />
      <View style={styles.heroTop}>
        <View style={styles.heroIcon}>
          <PurposeIcon icon={circle.emoji} size={22} color="#fff" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant={desktop ? 'display' : 'h1'} color="#fff" numberOfLines={2}>
            {circle.name}
          </Text>
          <Text variant="small" color="rgba(255,255,255,0.8)">
            {circle.status === 'forming' ? `${joined} joined` : `${circle.slots} slots`} · {payoutShort(circle)} · Starts {longDate(circle.start_date)}
          </Text>
        </View>
        <View style={styles.heroPill}>
          <Text variant="caption" color="#fff">
            {t(`st.${circle.status}`)}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Metric label={t('circle.pot')} value={peso(potOf(circle) * (rounds.length ? hulogInRound(contributions, current ?? rounds[0]) : plannedHulogPerSahod(circle)))} />
        <Metric label="Contribution" value={peso(circle.amount)} />
        <Metric label="Your slot" value={me?.slot_no ? `#${me.slot_no}` : '—'} />
        <Metric label="Progress" value={rounds.length ? `${completedRounds}/${rounds.length} rounds` : `${joined} joined`} />
      </View>
      {circle.status === 'active' && (
        <View style={styles.heroTrack}>
          <View style={[styles.heroFill, { width: `${(completedRounds / rounds.length) * 100}%` }]} />
        </View>
      )}
    </LinearGradient>
  );

  const deleteButton = isAdmin && !circle.deleted_at && (circle.status === 'forming' || circle.status === 'locked') && <DeleteCircleButton circle={circle} />;

  // ---------------- status panels
  const forming = circle.status === 'forming' && (
    <>
      <SlotsProgress data={data} />
      {!desktop && <InvitePanel circle={circle} isAdmin={isAdmin} />}
      {isAdmin && <FormingAdmin data={data} />}
      {isAdmin ? (
        <View style={{ gap: 8 }}>
          <Button
            title={t('circle.lock')}
            icon="lock"
            disabled={!lockable}
            loading={action.isPending}
            onPress={() =>
              run(
                `Lock with ${joined} members?`,
                `The paluwagan starts with ${joined} payout rounds, one per member, and no one else can join. A secret seed is generated now and its fingerprint (hash) is shown to every member before the draw, proving the result can’t be changed.`,
                'lock_circle',
                'Lock paluwagan',
              )
            }
          />
          <Text variant="small" tone="faint" center>
            {joined < MIN_TO_LOCK
              ? `${MIN_TO_LOCK - joined} more ${MIN_TO_LOCK - joined === 1 ? 'member' : 'members'} needed before you can lock the paluwagan.`
              : 'Lock it once everyone who’s joining is in.'}
          </Text>
        </View>
      ) : (
        null
      )}
      {deleteButton}
    </>
  );

  const locked = circle.status === 'locked' && (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text variant="h2">Ready for the draw</Text>
      </View>
      {circle.order_mode === 'draw' ? (
        <>
          <Text tone="muted">
            This commitment was published when the paluwagan was locked. After the draw, anyone can confirm the revealed seed matches it.
          </Text>
          <View style={[styles.hash, { backgroundColor: c.surfaceAlt }]}>
            <Text variant="caption" tone="faint">
              SHA-256 commitment
            </Text>
            <Text variant="mono" selectable>
              {circle.seed_hash}
            </Text>
          </View>
        </>
      ) : (
        <Text tone="muted">Waiting for the admin to set the payout order.</Text>
      )}
      {isAdmin ? (
        <View style={{ flexDirection: desktop ? 'row' : 'column', gap: 10 }}>
          <Button
            title={circle.order_mode === 'draw' ? t('circle.draw') : t('circle.setOrder')}
            icon={circle.order_mode === 'draw' ? 'shuffle' : 'list'}
            variant="brand"
            onPress={() => router.push(`/circle/${id}/draw`)}
            style={desktop ? { flex: 1 } : undefined}
          />
          <Button
            title={t('circle.unlock')}
            variant="secondary"
            onPress={() => run('Unlock this paluwagan?', 'The paluwagan will reopen for members and the commitment will be discarded.', 'unlock_circle', 'Unlock')}
            style={desktop ? { flex: 1 } : undefined}
          />
        </View>
      ) : (
        <Button title="Watch the draw" icon="eye" variant="secondary" onPress={() => router.push(`/circle/${id}/draw`)} />
      )}
      {deleteButton}
    </Card>
  );

  const activeRound = circle.status === 'active' && current && (
    <Card style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="overline" tone="muted">
          Round {current.round_no} · Sahod {longDate(current.due_date)}
        </Text>
        <Text variant="smallBold" tone="muted">
          {relativeDue(current.due_date)}
        </Text>
      </View>
      {/* What's been collected; the recipient is announced when the admin releases the sahod. */}
      <View style={{ gap: 2 }}>
        <Text variant="small" tone="muted">
          Collected for this round
        </Text>
        <Text variant="display" style={{ fontVariant: ['tabular-nums'] }}>
          {peso(collected - roundAdjTotal)}
        </Text>
        <Text variant="small" tone="muted">
          of {peso(roundPot)} · {confirmed.length} of {roundKs.length} payments confirmed
          {roundAdjTotal > 0 ? ` · ${peso(collected)} before deductions` : ''}
        </Text>
      </View>
      <AdjustmentLines
        rows={roundAdj.map((a) => ({ id: a.id, kind: a.kind, amount: Number(a.amount), reason: a.reason, at: a.created_at, who: members.find((m) => m.user_id === a.user_id)?.profiles?.full_name, splitCount: a.split_count }))}
        onRemove={isAdmin ? (r) => action.mutate({ fn: 'remove_deduction', args: { p_id: r.id } }, { onError: (e) => notifyError(e, 'Couldn’t remove it') }) : undefined}
      />
      <ProgressBar progress={roundPot ? collected / roundPot : 0} color={c.success} height={8} />
      {perRound > 1 && todayKs.length > 0 && (
        <View style={[styles.today, { backgroundColor: c.surfaceAlt }]}>
          <Feather name="calendar" size={15} color={c.brand} />
          <Text variant="small" style={{ flex: 1 }}>
            <Text variant="smallBold">Today’s hulog: </Text>
            {todayPaid.length} of {todayKs.length} paid · {peso(todayPaid.reduce((s, k) => s + Number(k.amount), 0))} collected
          </Text>
        </View>
      )}


      {isAdmin && (
        <View style={{ gap: 10 }}>
          {toConfirm.length > 0 ? (
            <Button
              title={`Confirm ${toConfirm.length} ${toConfirm.length === 1 ? 'payment' : 'payments'}`}
              icon="check-circle"
              variant="brand"
              onPress={() => router.push(`/circle/${id}/round/${toConfirm[0].round_id}`)}
            />
          ) : (
            <Text variant="small" tone="faint" center>
              No payments waiting for your confirmation.
            </Text>
          )}
          {canRelease ? (
            <Button title="Release sahod" icon="gift" variant={toConfirm.length ? 'secondary' : 'brand'} loading={action.isPending} onPress={release} />
          ) : (
            <Button title="Advance sahod" icon="fast-forward" variant="secondary" loading={action.isPending} onPress={() => setAdvanceOpen(true)} />
          )}
          <Button title="Delay sahod" icon="clock" variant="ghost" onPress={() => setDelayOpen(true)} />
          <Button title="Record a deduction" icon="minus-circle" variant="ghost" onPress={() => setDeductOpen(true)} />
          {!canRelease && (
            <Text variant="small" tone="faint" center>
              The sahod is on {longDate(current.due_date)}. Release it then, or earlier once everyone has paid.
            </Text>
          )}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Button title="All payments" icon="list" variant="secondary" size="sm" full={false} onPress={() => router.push(`/circle/${id}/round/${current.id}`)} />
        <Button title={openSwaps ? `Turn swaps (${openSwaps})` : 'Turn swaps'} icon="repeat" variant="secondary" size="sm" full={false} onPress={() => router.push(`/circle/${id}/swaps`)} />
      </View>
    </Card>
  );

  const completed = circle.status === 'completed' && (
    <>
      <Notice tone="success" icon="flag" title="This paluwagan is complete" body={`All ${rounds.length} rounds have been paid out. Thank you for contributing on time.`} />
      <RepeatPanel data={data} userId={userId} isAdmin={!!isAdmin} />
    </>
  );

  const tabs: { value: Tab; label: string }[] = desktop
    ? [
        { value: 'timeline', label: t('circle.timeline') },
        { value: 'rules', label: t('circle.rules') },
        { value: 'activity', label: 'Activity' },
      ]
    : [
        { value: 'timeline', label: t('circle.timeline') },
        { value: 'members', label: t('circle.members') },
        { value: 'rules', label: t('circle.rules') },
        { value: 'activity', label: 'Activity' },
      ];
  const shownTab = desktop && tab === 'members' ? 'timeline' : tab;

  const tabBody = (
    <>
      <View style={{ maxWidth: desktop ? 420 : undefined }}>
        <Segmented<Tab> value={shownTab} onChange={setTab} options={tabs} />
      </View>
      {shownTab === 'timeline' && <Timeline data={data} myGroup={me?.slot_group} />}
      {shownTab === 'members' && <MembersList data={data} userId={userId} isAdmin={isAdmin} />}
      {shownTab === 'rules' && <RulesPanel data={data} />}
      {shownTab === 'activity' && (
        <Card>
          {activity.data?.length ? <ActivityList items={activity.data} showCircle={false} /> : <Text tone="muted" center>No activity yet.</Text>}
        </Card>
      )}
    </>
  );

  const lifecycle = circle.deleted_at ? (
    <DeletedPanel circle={circle} isAdmin={isAdmin} />
  ) : circle.paused_at ? (
    <PausedPanel circle={circle} isAdmin={isAdmin} />
  ) : null;

  const main = (
    <>
      {lifecycle}
      {me?.status === 'approved' && !circle.deleted_at && <ChatEntry circleId={id} userId={userId} members={members} />}
      {!circle.deleted_at && forming}
      {!circle.deleted_at && locked}
      {circle.status === 'active' && !revealed && (
        <Card style={{ gap: 12 }}>
          <Text variant="h2">The draw isn’t finished yet</Text>
          <Text tone="muted">
            {isAdmin
              ? 'The payout order is already locked in, but members haven’t seen it. Finish the draw (or show the results) to open payments.'
              : 'The admin started the draw but hasn’t finished it. Payments open once everyone can see the payout order.'}
          </Text>
          <Button title={isAdmin ? 'Continue the draw' : 'Watch the draw'} icon={isAdmin ? 'play' : 'eye'} variant="brand" onPress={() => router.push(`/circle/${id}/draw`)} />
        </Card>
      )}
      {myOverdue.length > 0 && (
        <Card style={{ gap: 10, backgroundColor: c.dangerBg }}>
          <Text variant="bodyBold" tone="danger">
            You have {myOverdue.length} overdue hulog ({peso(overdueTotal)})
          </Text>
          <Text variant="small" tone="danger">
            The sahod for {myOverdue.length === 1 ? 'that round was' : 'those rounds were'} released without your payment. Pay as soon as you can to restore your Trust Score.
          </Text>
          <Button title="Pay overdue hulog" icon="send" size="md" variant="danger" onPress={() => router.push(`/circle/${id}/round/${myOverdue[0].round.id}`)} />
        </Card>
      )}
      {activeRound}
      {revealed && <SahodBalances data={data} isAdmin={!!isAdmin} mySlotGroup={me?.slot_group} />}
      {circle.status === 'active' && current && (
        <HulogChecklist
          data={data}
          round={current}
          isAdmin={!!isAdmin}
          userId={userId}
          onPay={(k) => {
            setPayK(k);
            setPayOpen(true);
          }}
        />
      )}
      {revealed && circle.status === 'active' && <PayInfoCard circle={circle} />}
      {isAdmin && !circle.deleted_at && circle.status !== 'completed' && (
        <Button
          title={circle.pay_method || circle.pay_note ? 'Edit where members pay' : 'Add where members pay (optional)'}
          icon="smartphone"
          variant="ghost"
          size="md"
          onPress={() => setPayInfoOpen(true)}
        />
      )}
      {isAdmin && circle.status === 'active' && circle.replacing_member && <ReplacementAdmin data={data} />}
      {isAdmin && circle.status === 'active' && !anyonePaid && (
        <Button
          title="Redo the draw"
          icon="rotate-ccw"
          variant="secondary"
          loading={action.isPending}
          onPress={() =>
            confirmAction(
              'Redo the draw?',
              'Nobody has paid yet, so the draw can be done again. The current payout order is cleared and a new secret seed is locked in, so the new draw is just as fair. Every member will see in Activity that the draw was redone.',
              () =>
                action.mutate(
                  { fn: 'redo_draw', args: { p_circle: id } },
                  { onSuccess: () => router.push(`/circle/${id}/draw`), onError: (e) => notifyError(e, 'Couldn’t redo the draw') },
                ),
              { confirmText: 'Redo the draw', icon: 'rotate-ccw' },
            )
          }
        />
      )}
      {isAdmin && circle.status === 'active' && !circle.paused_at && <PauseCircleButton circle={circle} />}
      {!circle.deleted_at && <FundGives data={data} userId={userId} />}
      <MembershipPanel data={data} userId={userId} />
      {completed}
      {tabBody}
    </>
  );

  return (
    <Screen back refreshing={q.isRefetching} onRefresh={() => { q.refetch(); activity.refetch(); }}>
      {hero}
      {desktop ? (
        <Columns
          main={main}
          side={
            <>
              {circle.status === 'forming' && <InvitePanel circle={circle} isAdmin={isAdmin} />}
              <MembersList data={data} userId={userId} isAdmin={isAdmin} />
            </>
          }
        />
      ) : (
        main
      )}
      {isAdmin && <PayInfoSheet open={payInfoOpen} onClose={() => setPayInfoOpen(false)} circle={circle} />}
      {current && isAdmin && (
        <DeductionSheet
          open={deductOpen}
          onClose={() => setDeductOpen(false)}
          collected={collected - roundAdjTotal}
          loading={action.isPending}
          onConfirm={(amount, reason) =>
            action.mutate(
              { fn: 'add_deduction', args: { p_circle: id, p_amount: amount, p_reason: reason } },
              { onSuccess: () => setDeductOpen(false), onError: (e) => notifyError(e, 'Couldn’t record the deduction') },
            )
          }
        />
      )}
      {current && isAdmin && (
        <AdvanceSahodSheet
          open={advanceOpen}
          onClose={() => setAdvanceOpen(false)}
          name={iAmRecipient ? 'you' : slotName(recipients)}
          pot={roundTotal}
          collected={collected}
          dueDate={current.due_date}
          anchor={resumeAnchor}
          lastSahod={lastRound && lastRound.status !== 'completed' ? lastRound.due_date : null}
          loading={action.isPending}
          onConfirm={advance}
        />
      )}
      {current && isAdmin && (
        <DelaySahodSheet
          key={current.id + current.due_date}
          open={delayOpen}
          onClose={() => setDelayOpen(false)}
          circleId={id}
          round={current}
          next={rounds.find((r) => r.round_no === current.round_no + 1)}
        />
      )}
      {current && (payK ?? myK) && (
        <PaySheet
          open={payOpen}
          onClose={() => {
            setPayOpen(false);
            setPayK(null);
          }}
          circle={circle}
          round={rounds.find((r) => r.id === (payK ?? myK)!.round_id) ?? current}
          contribution={(payK ?? myK)!}
          recipients={admins}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  today: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.md },
  chatIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  unread: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: radius.xl, padding: 22, gap: 22, overflow: 'hidden' },
  heroDeco: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.1)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  heroPill: { backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  heroTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden' },
  heroFill: { height: '100%', borderRadius: 3, backgroundColor: '#fff' },
  hash: { padding: 12, borderRadius: radius.sm, gap: 4 },
  myPay: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.md, padding: 14 },
});

export default withAccount(CircleScreenScreen, 'Online paluwagan');
