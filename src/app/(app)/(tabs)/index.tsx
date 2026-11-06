import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CircleCard } from '@/components/circle/CircleCard';
import { GoalSheet } from '@/components/GoalSheet';
import { Avatar, EmptyState, ProgressRing, SectionTitle, StatusChip } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useGoals, useMyCircles, type MyCircle } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { nextPayout, summarize, unpaid } from '@/lib/derive';
import { displayStatus, firstName, longDate, peso, relativeDue } from '@/lib/format';
import { useColors, usePrefs, useT } from '@/lib/prefs';
import type { Goal } from '@/lib/types';
import { radius } from '@/theme/tokens';

export default function Home() {
  const t = useT();
  const c = useColors();
  const { lang } = usePrefs();
  const { profile } = useAuth();
  const circles = useMyCircles();
  const goals = useGoals();
  const [goalSheet, setGoalSheet] = useState<{ open: boolean; goal?: Goal | null }>({ open: false });

  const list = circles.data ?? [];
  const next = nextPayout(list);
  const dues = list
    .flatMap((mc) => unpaid(mc.contributions, mc.rounds).map((x) => ({ ...x, mc })))
    .sort((a, b) => a.round.due_date.localeCompare(b.round.due_date))
    .slice(0, 4);

  return (
    <Screen tabs refreshing={circles.isRefetching} onRefresh={() => { circles.refetch(); goals.refetch(); }}>
      <View style={styles.header}>
        <View>
          <Text tone="muted">{t('home.greeting')}</Text>
          <Text variant="h1">{firstName(profile?.full_name)} 👋</Text>
        </View>
        <PressableScale onPress={() => router.push('/profile')}>
          <Avatar emoji={profile?.avatar_emoji} size={48} bg={c.accent} />
        </PressableScale>
      </View>

      {circles.isPending ? (
        <Card style={{ height: 200 }}>
          <View />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState emoji="🐷" title={t('home.noCircles')} body={t('home.noCirclesBody')}>
            <Button title="Gumawa ng circle" icon="plus" onPress={() => router.push('/create')} />
            <Button title="Sumali gamit ang code" variant="secondary" icon="key" onPress={() => router.push('/join')} />
          </EmptyState>
        </Card>
      ) : (
        <>
          {next && <PayoutHero mc={next.mc} />}

          <SectionTitle title={t('home.dueSoon')} />
          {dues.length === 0 ? (
            <Card>
              <Text tone="muted" center>
                {t('home.allPaid')}
              </Text>
            </Card>
          ) : (
            dues.map(({ k, round, mc }, i) => (
              <Animated.View key={k.id} entering={FadeInDown.delay(60 * i)}>
                <Card onPress={() => router.push(`/circle/${mc.circle.id}/round/${round.id}`)}>
                  <View style={styles.dueRow}>
                    <View style={[styles.dueEmoji, { backgroundColor: c.surfaceAlt }]}>
                      <Text style={{ fontSize: 22, lineHeight: 28 }}>{mc.circle.emoji}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="bodyBold" numberOfLines={1}>
                        {mc.circle.name}
                      </Text>
                      <Text variant="small" tone="muted">
                        Round {round.round_no} · {relativeDue(round.due_date, lang)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text variant="h3">{peso(k.amount)}</Text>
                      <StatusChip status={displayStatus(k, round, mc.circle)} />
                    </View>
                  </View>
                </Card>
              </Animated.View>
            ))
          )}

          <SectionTitle title={t('home.goals')} action="+ Bago" onAction={() => setGoalSheet({ open: true })} />
          <GoalsRow goals={goals.data ?? []} circles={list} onEdit={(g) => setGoalSheet({ open: true, goal: g })} onAdd={() => setGoalSheet({ open: true })} />

          <SectionTitle title={t('circles.title')} action="Lahat →" onAction={() => router.push('/circles')} />
          {list.slice(0, 2).map((mc) => (
            <CircleCard key={mc.circle.id} mc={mc} />
          ))}
        </>
      )}
      <GoalSheet open={goalSheet.open} goal={goalSheet.goal} onClose={() => setGoalSheet({ open: false })} />
    </Screen>
  );
}

function PayoutHero({ mc }: { mc: MyCircle }) {
  const t = useT();
  const c = useColors();
  const s = summarize(mc);
  const total = mc.rounds.length;
  const mine = s.roundsAway === 0;
  return (
    <Animated.View entering={FadeInDown.springify()}>
      <PressableScale onPress={() => router.push(`/circle/${mc.circle.id}`)} style={[styles.hero, { backgroundColor: mine ? c.accent : c.ink }]}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text variant="caption" color={mine ? c.accentInk : c.onInk} style={{ opacity: 0.7 }}>
            {mine ? t('home.yourTurn') : t('home.nextSahod')}
          </Text>
          <Text variant="hero" color={mine ? c.accentInk : c.onInk} adjustsFontSizeToFit numberOfLines={1}>
            {peso(s.myPayout)}
          </Text>
          <Text variant="smallBold" color={mine ? c.accentInk : c.onInk} style={{ opacity: 0.75 }}>
            {mc.circle.emoji} {mc.circle.name} · {s.myRound ? longDate(s.myRound.due_date) : ''}
          </Text>
        </View>
        <ProgressRing
          size={84}
          stroke={9}
          progress={total ? (s.myRound!.round_no - (s.roundsAway ?? 0)) / s.myRound!.round_no : 0}
          color={mine ? c.accentInk : c.accent}
          track={mine ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)'}>
          {mine ? (
            <Text style={{ fontSize: 30, lineHeight: 36 }}>🎉</Text>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <Text variant="h1" color={c.onInk}>
                {s.roundsAway}
              </Text>
              <Text variant="small" color={c.onInk} style={{ fontSize: 10, lineHeight: 12, opacity: 0.7 }}>
                rounds
              </Text>
            </View>
          )}
        </ProgressRing>
      </PressableScale>
    </Animated.View>
  );
}

function GoalsRow({ goals, circles, onEdit, onAdd }: { goals: Goal[]; circles: MyCircle[]; onEdit: (g: Goal) => void; onAdd: () => void }) {
  const c = useColors();
  if (!goals.length) {
    return (
      <Card onPress={onAdd}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 28, lineHeight: 34 }}>🎯</Text>
          <View style={{ flex: 1 }}>
            <Text variant="bodyBold">Saan mo gagamitin ang sahod mo?</Text>
            <Text variant="small" tone="muted">
              Mag-set ng Ipon Goal at i-link sa paluwagan mo.
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={c.textFaint} />
        </View>
      </Card>
    );
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {goals.map((g) => {
        const mc = circles.find((x) => x.circle.id === g.circle_id);
        const s = mc ? summarize(mc) : null;
        const progress = s ? Math.min(1, s.paidIn / Number(g.target)) : 0;
        return (
          <Card key={g.id} onPress={() => onEdit(g)} style={{ flexBasis: '47%', flexGrow: 1, gap: 10 }} tint={mc?.circle.color}>
            <ProgressRing size={56} stroke={6} progress={progress} color={c.ink} track="rgba(0,0,0,0.08)">
              <Text style={{ fontSize: 22, lineHeight: 28 }}>{g.emoji}</Text>
            </ProgressRing>
            <View>
              <Text variant="bodyBold" numberOfLines={1}>
                {g.title}
              </Text>
              <Text variant="small" tone="muted">
                {peso(s?.paidIn ?? 0, { compact: true })} / {peso(g.target, { compact: true })}
              </Text>
              {s?.roundsAway != null && (
                <Text variant="smallBold" style={{ marginTop: 4 }}>
                  {s.roundsAway === 0 ? 'Sahod mo na ngayon!' : `${s.roundsAway} rounds bago ang sahod`}
                </Text>
              )}
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  hero: { borderRadius: radius.xl, padding: 22, flexDirection: 'row', alignItems: 'center', gap: 16 },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dueEmoji: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
