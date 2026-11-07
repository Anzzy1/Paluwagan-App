import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CircleCard } from '@/components/circle/CircleCard';
import { GoalSheet } from '@/components/GoalSheet';
import { GoalRow } from '@/components/ipon/GoalRow';
import { ManagedCard } from '@/components/ManagedCard';
import { Mascot } from '@/components/Mascot';
import { BubbleButton, MascotBand, MASCOT_NAME } from '@/components/MascotBand';
import { Avatar, ProgressRing, type IconName } from '@/components/ui/bits';
import { Card } from '@/components/ui/Card';
import { IconTile } from '@/components/ui/Featured';
import { type NavIconName } from '@/components/NavIcons';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useDeposits, useGoals, useMyCircles } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { nextPayout, summarize, unpaid } from '@/lib/derive';
import { daysUntil, firstName, parseDate, peso, shortDate } from '@/lib/format';
import { useColors, useIsDesktop } from '@/lib/prefs';
import { homeTip, onTimeStreak } from '@/lib/rewards';
import { goalProgress } from '@/lib/ipon';
import { useManagedCircles } from '@/lib/local';
import { radius } from '@/theme/tokens';

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function CardTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  return (
    <View style={styles.cardTitle}>
      <Text variant="h3">{title}</Text>
      {action && (
        <PressableScale onPress={onAction} hapticOnPress={false} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text variant="smallBold" tone="brand">
            {action}
          </Text>
          <Feather name="chevron-right" size={15} color={c.brand} />
        </PressableScale>
      )}
    </View>
  );
}

export default function Home() {
  const c = useColors();
  const desktop = useIsDesktop();
  const { profile, isDemo, signOut } = useAuth();
  const circles = useMyCircles();
  const goals = useGoals();
  const deposits = useDeposits();
  const [goalSheet, setGoalSheet] = useState(false);

  const list = circles.data ?? [];
  const managed = useManagedCircles();
  const name = firstName(profile?.full_name);
  const tip = homeTip(list, name);
  const streak = onTimeStreak(list);
  const next = nextPayout(list);
  const dues = list
    .flatMap((mc) => unpaid(mc.contributions, mc.rounds).map((x) => ({ ...x, mc })))
    .sort((a, b) => a.due.localeCompare(b.due));
  const totalDue = dues.reduce((s, d) => s + Number(d.k.amount), 0);
  const contributed = list.reduce((s, mc) => s + summarize(mc).paidIn, 0);

  // ---------------- header
  const header = (
    <View style={{ gap: 14 }}>
      <View style={styles.headerRow}>
        <PressableScale onPress={() => router.push('/profile')} hapticOnPress={false} scaleTo={0.94} accessibilityLabel="Profile">
          <Avatar name={profile?.full_name} seed={profile?.id} uri={profile?.avatar_url} size={44} ring={c.surface} />
        </PressableScale>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            { icon: 'bell' as IconName, go: () => router.push('/activity') },
            { icon: 'settings' as IconName, go: () => router.push('/settings' as Href) },
          ].map((b) => (
            <PressableScale key={b.icon} onPress={b.go} hapticOnPress={false} style={[styles.round, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Feather name={b.icon} size={18} color={c.brand} />
            </PressableScale>
          ))}
        </View>
      </View>
      <View>
        <Text variant="body" tone="muted">
          {greeting()},
        </Text>
        <Text variant="display" style={{ marginTop: 2 }}>
          {name}
          <Text variant="display" tone="brand">
            .
          </Text>
        </Text>
      </View>
    </View>
  );

  // ---------------- Ipon (mascot) band
  const band = (
    <MascotBand
      mood={tip.mood}
      pose={tip.pose}
      trigger={tip.text}
      action="wave"
      repeatEvery={9000}
      actions={
        <>
          {tip.cta && <BubbleButton primary label={tip.cta.label} iconRight="arrow-right" onPress={() => router.push(tip.cta!.href as never)} />}
          <BubbleButton label={`Ask ${MASCOT_NAME}`} icon="message-circle" onPress={() => router.push('/assistant' as Href)} />
        </>
      }>
      <Text variant="body" style={{ lineHeight: 22 }}>
        {tip.text}
      </Text>
    </MascotBand>
  );

  // ---------------- quick actions
  const actions: { icon: NavIconName; label: string; onPress: () => void }[] = [
    { icon: 'create', label: 'Create', onPress: () => router.push('/create') },
    { icon: 'join', label: 'Join', onPress: () => router.push('/join') },
    {
      icon: 'pay',
      label: 'Pay',
      onPress: () => (dues[0] ? router.push(`/circle/${dues[0].mc.circle.id}/round/${dues[0].round.id}`) : router.push('/circles')),
    },
    { icon: 'ipon', label: 'Ipon', onPress: () => router.push('/ipon' as Href) },
    { icon: 'assistant', label: `${MASCOT_NAME} AI`, onPress: () => router.push('/assistant' as Href) },
  ];
  const quick = (
    <Card style={{ gap: 14 }}>
      <CardTitle title="Quick actions" />
      <View style={styles.actions}>
        {actions.map((a) => (
          <PressableScale key={a.label} onPress={a.onPress} style={styles.action}>
            <IconTile icon={a.icon} size={desktop ? 52 : 48} />
            <Text variant="smallBold" numberOfLines={1} style={{ fontSize: 12 }}>
              {a.label}
            </Text>
          </PressableScale>
        ))}
      </View>
    </Card>
  );

  // ---------------- summary cards
  const s = next ? summarize(next.mc) : null;
  const summary = (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Card style={{ flex: 1, gap: 10 }} onPress={next ? () => router.push(`/circle/${next.mc.circle.id}`) : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <ProgressRing size={42} stroke={5} progress={s?.myRound ? (s.myRound.round_no - (s.roundsAway ?? 0)) / s.myRound.round_no : 0} color={c.gold}>
            <Feather name="gift" size={15} color={c.gold} />
          </ProgressRing>
          <Text variant="caption" tone="faint" numberOfLines={1}>
            {s?.myRound ? shortDate(s.myRound.due_date) : ''}
          </Text>
        </View>
        <Text variant="smallBold" tone="muted" numberOfLines={1}>
          Next payout
        </Text>
        <Text variant="h1" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
          {s ? peso(s.myPayout) : '—'}
        </Text>
        <Text variant="caption" tone={s?.roundsAway === 0 ? 'brand' : 'muted'}>
          {s ? (s.roundsAway === 0 ? 'This round!' : `In ${s.roundsAway} ${s.roundsAway === 1 ? 'round' : 'rounds'}`) : 'Join a circle to start'}
        </Text>
      </Card>
      <Card style={{ flex: 1, gap: 10 }} onPress={() => router.push('/profile')}>
        <View style={[styles.miniIcon, { backgroundColor: c.brandSoft, width: 42, height: 42, borderRadius: 21 }]}>
          <Feather name="trending-up" size={17} color={c.brand} />
        </View>
        <Text variant="smallBold" tone="muted" numberOfLines={1}>
          Saved so far
        </Text>
        <Text variant="h1" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
          {peso(contributed)}
        </Text>
        <Text variant="caption" tone="warning">
          {streak > 0 ? `${streak} on time in a row` : 'Pay on time to start a streak'}
        </Text>
      </Card>
    </View>
  );

  // ---------------- payments due
  const paymentsDue = (
    <Card padded={false}>
      <View style={[styles.cardTitle, { padding: 18, paddingBottom: 12 }]}>
        <View>
          <Text variant="h3">Payments due</Text>
          <Text variant="caption" tone="faint">
            {dues.length ? `${dues.length} contribution${dues.length === 1 ? '' : 's'} coming up` : 'Nothing coming up'}
          </Text>
        </View>
        {dues.length > 0 && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="money">{peso(totalDue)}</Text>
            <Text variant="overline" tone="faint" style={{ fontSize: 9 }}>
              Total due
            </Text>
          </View>
        )}
      </View>
      {dues.length === 0 ? (
        <View style={[styles.allClear, { borderTopColor: c.border }]}>
          <Feather name="check-circle" size={18} color={c.success} />
          <Text variant="smallBold" tone="success">
            You’re all caught up!
          </Text>
        </View>
      ) : (
        dues.slice(0, desktop ? 6 : 4).map(({ k, round, mc, due }) => {
          const d = daysUntil(due);
          const overdue = d < -mc.circle.grace_days;
          const soon = !overdue && d <= 3;
          const tone = overdue ? { bg: c.dangerBg, fg: c.danger } : soon ? { bg: c.warningBg, fg: c.warning } : { bg: c.surfaceAlt, fg: c.textMuted };
          const date = parseDate(due);
          return (
            <PressableScale
              key={k.id}
              hapticOnPress={false}
              scaleTo={0.99}
              onPress={() => router.push(`/circle/${mc.circle.id}/round/${round.id}`)}
              style={[styles.dueRow, { borderTopColor: c.border }]}>
              <View style={[styles.dateBlock, { backgroundColor: overdue ? c.dangerBg : c.surfaceAlt }]}>
                <Text variant="caption" style={{ fontSize: 10, lineHeight: 12 }} color={overdue ? c.danger : c.textFaint}>
                  {MON[date.getMonth()]}
                </Text>
                <Text variant="h2" color={overdue ? c.danger : c.text} style={{ lineHeight: 22 }}>
                  {date.getDate()}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={[styles.dueChip, { backgroundColor: tone.bg }]}>
                  <Text variant="caption" style={{ fontSize: 11, lineHeight: 14 }} color={tone.fg}>
                    {overdue ? `${-d} day${d === -1 ? '' : 's'} overdue` : d <= 0 ? 'Due today' : `${d} day${d === 1 ? '' : 's'} left`}
                  </Text>
                </View>
                <Text variant="bodyBold" numberOfLines={1}>
                  {mc.circle.name}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="money">{peso(k.amount)}</Text>
                <Text variant="caption" tone="faint">
                  Round {round.round_no}
                </Text>
              </View>
            </PressableScale>
          );
        })
      )}
    </Card>
  );

  // ---------------- circles
  const circlesBlock = list.length || managed.length ? (
    <View style={{ gap: 12 }}>
      <CardTitle title="My circles" action="See all" onAction={() => router.push('/circles')} />
      {desktop ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          {list.slice(0, 4).map((mc) => (
            <CircleCard key={mc.circle.id} mc={mc} style={{ flexBasis: '47%', flexGrow: 1 }} />
          ))}
          {managed.slice(0, 4).map((m) => (
            <ManagedCard key={m.id} circle={m} style={{ flexBasis: '47%', flexGrow: 1 }} />
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -20 }}
          contentContainerStyle={{ gap: 12, paddingHorizontal: 20, paddingBottom: 18 }}>
          {list.map((mc) => (
            <CircleCard key={mc.circle.id} mc={mc} style={{ width: 290 }} />
          ))}
          {managed.map((m) => (
            <ManagedCard key={m.id} circle={m} style={{ width: 290 }} />
          ))}
        </ScrollView>
      )}
    </View>
  ) : (
    <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 26 }}>
      <Mascot size={96} mood="excited" pose="cheer" />
      <Text variant="h2" center>
        Start your first circle
      </Text>
      <Text tone="muted" center style={{ maxWidth: 340 }}>
        Invite people you trust, run a fair draw, and track every contribution together.
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <PressableScale onPress={() => router.push('/create')} style={[styles.pillBtn, { backgroundColor: c.ink }]}>
          <Feather name="plus" size={16} color={c.onInk} />
          <Text variant="bodyBold" color={c.onInk}>
            New circle
          </Text>
        </PressableScale>
        <PressableScale onPress={() => router.push('/join')} style={[styles.pillBtn, { backgroundColor: c.surfaceAlt }]}>
          <Feather name="log-in" size={16} color={c.text} />
          <Text variant="bodyBold">Join</Text>
        </PressableScale>
      </View>
    </Card>
  );

  const goalList = (goals.data ?? []).map((g) => goalProgress(g, deposits.data ?? [], list));
  const goalsBlock = (
    <Card style={{ gap: 16 }}>
      <CardTitle title="Ipon goals" action={goalList.length ? 'See all' : 'Add'} onAction={() => (goalList.length ? router.push('/ipon' as Href) : setGoalSheet(true))} />
      {goalList.length ? (
        goalList.slice(0, 3).map((p) => <GoalRow key={p.goal.id} p={p} />)
      ) : (
        <Text variant="small" tone="muted">
          Save on your own too. Add a goal like “Emergency fund” or “New phone”, set a plan, and log every hulog.
        </Text>
      )}
    </Card>
  );

  const demoBanner = isDemo && (
    <PressableScale onPress={signOut} hapticOnPress={false} style={[styles.demo, { backgroundColor: c.infoBg }]}>
      <Feather name="eye" size={16} color={c.info} />
      <Text variant="smallBold" tone="info" style={{ flex: 1 }}>
        Viewing sample data
      </Text>
      <Text variant="smallBold" tone="info">
        Exit
      </Text>
    </PressableScale>
  );

  return (
    <Screen tabs refreshing={circles.isRefetching} onRefresh={() => { circles.refetch(); goals.refetch(); deposits.refetch(); }}>
      {header}
      {demoBanner}
      {desktop ? (
        <>
          <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
            <View style={{ flex: 1.4, gap: 16 }}>
              {band}
              {quick}
              {paymentsDue}
            </View>
            <View style={{ flex: 1, gap: 16 }}>
              {summary}
              {goalsBlock}
            </View>
          </View>
          {circlesBlock}
        </>
      ) : (
        <>
          {band}
          {quick}
          {summary}
          {paymentsDue}
          {circlesBlock}
          {goalsBlock}
        </>
      )}
      <GoalSheet open={goalSheet} onClose={() => setGoalSheet(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  round: { width: 44, height: 44, borderRadius: 22, borderWidth: 0, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  action: { flex: 1, alignItems: 'center', gap: 8 },
  miniIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1 },
  dateBlock: { width: 46, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dueChip: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  allClear: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 18, borderTopWidth: 1 },
  pillBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, height: 46, borderRadius: 23 },
  demo: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.md },
});
