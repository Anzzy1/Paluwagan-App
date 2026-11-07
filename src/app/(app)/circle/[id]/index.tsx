import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ActivityList } from '@/components/ActivityList';
import { FormingAdmin, InvitePanel, MembersList, RulesPanel, SlotsProgress, Timeline } from '@/components/circle/panels';
import { DeleteCircleButton, DeletedPanel, PauseCircleButton, PausedPanel } from '@/components/circle/Lifecycle';
import { PaySheet } from '@/components/circle/PaySheet';
import { AvatarStack, Notice, ProgressBar, PurposeIcon, Segmented, StatusChip } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card, useTint } from '@/components/ui/Card';
import { Columns, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { confirmAction, notify, notifyError } from '@/lib/alert';
import { useActivity, useCircle, useCircleAction, useNudge } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dueOf, hulogInRound, myNextContribution, plannedHulogPerSahod, recipientsOf } from '@/lib/derive';
import { displayStatus, longDate, payoutShort, peso, potOf, relativeDue, shortDate, slotName } from '@/lib/format';
import { useColors, useIsDesktop, useT } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

type Tab = 'timeline' | 'members' | 'rules' | 'activity';

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

export default function CircleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const c = useColors();
  const desktop = useIsDesktop();
  const { userId } = useAuth();
  const q = useCircle(id);
  const activity = useActivity(id);
  const action = useCircleAction(id);
  const nudge = useNudge();
  const [tab, setTab] = useState<Tab>('timeline');
  const [payOpen, setPayOpen] = useState(false);
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

  const data = q.data;
  const { circle, members, rounds, contributions } = data;
  const me = members.find((m) => m.user_id === userId);
  const isAdmin = me?.role === 'admin';
  const current = rounds.find((r) => r.status === 'active');
  const recipients = recipientsOf(current, members);
  const iAmRecipient = !!current && me?.slot_group === current.slot_group;
  const myK = myNextContribution(contributions, current, me?.id);
  const myHulog = current ? hulogInRound(contributions, current, me?.id) : 1;
  const roundKs = current ? contributions.filter((k) => k.round_id === current.id) : [];
  const confirmed = roundKs.filter((k) => k.status === 'confirmed');
  const collected = confirmed.reduce((s, k) => s + Number(k.amount), 0);
  const toReview = roundKs.filter((k) => k.status === 'submitted').length;
  const openSwaps = data.swaps.filter((s) => s.status === 'pending' || s.status === 'accepted').length;
  const filled = members.filter((m) => m.status === 'approved').reduce((s, m) => s + Number(m.share), 0);
  const completedRounds = rounds.filter((r) => r.status === 'completed').length;

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
            {circle.slots} slots · {payoutShort(circle)} · Starts {longDate(circle.start_date)}
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
        <Metric label="Progress" value={rounds.length ? `${completedRounds}/${rounds.length} rounds` : `${filled}/${circle.slots} filled`} />
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
            disabled={filled < circle.slots}
            loading={action.isPending}
            onPress={() =>
              run(
                'Lock this paluwagan?',
                'No one else will be able to join. A secret seed is generated now and its fingerprint (hash) is shown to every member before the draw, proving the result can’t be changed.',
                'lock_circle',
                'Lock paluwagan',
              )
            }
          />
          {filled < circle.slots && (
            <Text variant="small" tone="faint" center>
              All {circle.slots} slots must be filled before you can lock the paluwagan.
            </Text>
          )}
        </View>
      ) : (
        <Button title={t('circle.leave')} variant="ghost" onPress={() => run('Leave this paluwagan?', 'You can request to join again while it’s still open.', 'leave_circle', 'Leave')} />
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
          Round {current.round_no} · {longDate(current.due_date)}
        </Text>
        <Text variant="smallBold" tone="muted">
          {relativeDue(current.due_date)}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <AvatarStack people={recipients.map((m) => ({ id: m.user_id, name: m.profiles?.full_name, uri: m.profiles?.avatar_url }))} size={44} />
        <View style={{ flex: 1 }}>
          <Text variant="small" tone="muted">
            Payout recipient
          </Text>
          <Text variant="h2">{iAmRecipient ? 'You' : slotName(recipients)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="small" tone="muted">
            Collected
          </Text>
          <Text variant="h2" style={{ fontVariant: ['tabular-nums'] }}>
            {peso(collected)}
          </Text>
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <ProgressBar progress={collected / (potOf(circle) * hulogInRound(contributions, current))} color={c.success} height={8} />
        <Text variant="small" tone="muted">
          {confirmed.length} of {roundKs.length} payments confirmed · {peso(potOf(circle) * hulogInRound(contributions, current))} total
        </Text>
      </View>

      {iAmRecipient ? (
        <Button
          title={toReview ? `Review ${toReview} pending ${toReview === 1 ? 'payment' : 'payments'}` : 'View payments'}
          icon="check-circle"
          variant={toReview ? 'brand' : 'secondary'}
          onPress={() => router.push(`/circle/${id}/round/${current.id}`)}
        />
      ) : myK ? (
        <View style={[styles.myPay, { borderColor: c.border }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="small" tone="muted">
              {myHulog > 1 && current ? `Your hulog · due ${shortDate(dueOf(myK, current))}` : 'Your contribution'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="money">{peso(myK.amount)}</Text>
              <StatusChip status={displayStatus(myK, current, circle)} />
            </View>
            {myK.status === 'rejected' && myK.reject_reason ? (
              <Text variant="small" tone="danger">
                Rejected: {myK.reject_reason}
              </Text>
            ) : null}
          </View>
          {(myK.status === 'pending' || myK.status === 'rejected') && (
            <Button title="Pay now" full={false} size="md" onPress={() => setPayOpen(true)} />
          )}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {(isAdmin || iAmRecipient) && confirmed.length < roundKs.length && (
          <Button
            title={t('circle.nudge')}
            icon="bell"
            variant="secondary"
            size="sm"
            full={false}
            loading={nudge.isPending}
            onPress={() =>
              nudge.mutate(current.id, {
                onSuccess: (r) => notify('Reminder sent', `${r.sent} member${r.sent === 1 ? '' : 's'} notified.`),
                onError: (e) => notifyError(e, 'Couldn’t send reminder'),
              })
            }
          />
        )}
        {isAdmin && !iAmRecipient && (
          <Button title="Open round" icon="external-link" variant="secondary" size="sm" full={false} onPress={() => router.push(`/circle/${id}/round/${current.id}`)} />
        )}
        <Button title={openSwaps ? `Turn swaps (${openSwaps})` : 'Turn swaps'} icon="repeat" variant="secondary" size="sm" full={false} onPress={() => router.push(`/circle/${id}/swaps`)} />
      </View>
    </Card>
  );

  const completed = circle.status === 'completed' && (
    <Notice tone="success" icon="flag" title="This paluwagan is complete" body={`All ${rounds.length} rounds have been paid out. Thank you for contributing on time.`} />
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
      {shownTab === 'members' && <MembersList data={data} userId={userId} />}
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
      {!circle.deleted_at && forming}
      {!circle.deleted_at && locked}
      {activeRound}
      {isAdmin && circle.status === 'active' && !circle.paused_at && <PauseCircleButton circle={circle} />}
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
              <MembersList data={data} userId={userId} />
            </>
          }
        />
      ) : (
        main
      )}
      {current && myK && <PaySheet open={payOpen} onClose={() => setPayOpen(false)} circle={circle} round={current} contribution={myK} recipients={recipients} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
