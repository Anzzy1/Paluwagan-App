import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ActivityList } from '@/components/ActivityList';
import { FormingAdmin, InvitePanel, MembersList, RulesPanel, SlotsProgress, Timeline } from '@/components/circle/panels';
import { PaySheet } from '@/components/circle/PaySheet';
import { Avatar, Chip, IconButton, ProgressBar, Segmented, StatusChip } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card, useTint } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useActivity, useCircle, useCircleAction, useNudge } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { recipientsOf } from '@/lib/derive';
import { displayStatus, frequencyLabel, longDate, peso, potOf, relativeDue, slotName } from '@/lib/format';
import { useColors, usePrefs, useT } from '@/lib/prefs';
import { errMsg } from '@/lib/supabase';
import { radius } from '@/theme/tokens';

type Tab = 'timeline' | 'members' | 'rules' | 'activity';

export default function CircleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const c = useColors();
  const { lang } = usePrefs();
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
      <Screen back title="Hindi ma-open">
        <Text tone="muted">{errMsg(q.error) || 'Wala kang access sa circle na ito.'}</Text>
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
  const myK = current && contributions.find((k) => k.round_id === current.id && k.member_id === me?.id);
  const roundKs = current ? contributions.filter((k) => k.round_id === current.id) : [];
  const confirmed = roundKs.filter((k) => k.status === 'confirmed').length;
  const toReview = roundKs.filter((k) => k.status === 'submitted').length;
  const pendingSwaps = data.swaps.filter((s) => s.status === 'pending' || s.status === 'accepted').length;
  const filled = members.filter((m) => m.status === 'approved').reduce((s, m) => s + Number(m.share), 0);

  const confirmAction = (title: string, msg: string, fn: string) =>
    Alert.alert(title, msg, [
      { text: 'Hindi muna' },
      {
        text: 'Oo, tuloy',
        onPress: () => action.mutate({ fn, args: { p_circle: id } }, { onError: (e) => Alert.alert('May mali', errMsg(e)) }),
      },
    ]);

  return (
    <Screen
      back
      refreshing={q.isRefetching}
      onRefresh={() => {
        q.refetch();
        activity.refetch();
      }}
      right={
        circle.status === 'active' ? (
          <IconButton icon="repeat" onPress={() => router.push(`/circle/${id}/swaps`)} />
        ) : undefined
      }>
      {/* Hero */}
      <Animated.View entering={FadeInDown.springify()} style={[styles.hero, { backgroundColor: tint.bg }]}>
        <View style={styles.heroTop}>
          <Avatar emoji={circle.emoji} size={56} bg={c.surface} />
          <View style={{ flex: 1 }}>
            <Text variant="h1" numberOfLines={2}>
              {circle.name}
            </Text>
            <Text variant="small" tone="muted">
              {peso(circle.amount)} {t('circle.perSlot')} · {frequencyLabel[circle.frequency][lang]}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Text variant="caption" tone="muted">
              {t('circle.pot')}
            </Text>
            <Text variant="hero">{peso(potOf(circle))}</Text>
          </View>
          <Chip label={t(`st.${circle.status}`)} tone={circle.status === 'active' ? 'ink' : circle.status === 'completed' ? 'success' : 'neutral'} />
        </View>
        {circle.status === 'active' && (
          <View style={{ gap: 6 }}>
            <ProgressBar progress={rounds.filter((r) => r.status === 'completed').length / rounds.length} color={tint.strong} />
            <Text variant="smallBold" tone="muted">
              Round {current?.round_no ?? '—'} of {rounds.length} · Slot mo: #{me?.slot_no ?? '—'}
            </Text>
          </View>
        )}
      </Animated.View>

      {/* ---------- FORMING ---------- */}
      {circle.status === 'forming' && (
        <>
          <SlotsProgress data={data} />
          <InvitePanel code={circle.invite_code} name={circle.name} />
          {isAdmin && <FormingAdmin data={data} />}
          {isAdmin ? (
            <Button
              title={t('circle.lock')}
              icon="lock"
              disabled={filled < circle.slots}
              loading={action.isPending}
              onPress={() =>
                confirmAction(
                  'I-lock ang circle?',
                  'Hindi na makakasali ang iba. Gagawa ang app ng sikretong “seed” at ipapakita ang hash nito sa lahat bago ang bunot — para patunayang walang dayaan.',
                  'lock_circle',
                )
              }
            />
          ) : (
            <Button title={t('circle.leave')} variant="ghost" onPress={() => confirmAction('Umalis sa circle?', '', 'leave_circle')} />
          )}
          {isAdmin && filled < circle.slots && (
            <Text variant="small" tone="faint" center>
              Mapupuno muna ang {circle.slots} slots bago ma-lock.
            </Text>
          )}
        </>
      )}

      {/* ---------- LOCKED ---------- */}
      {circle.status === 'locked' && (
        <Card style={{ gap: 10 }}>
          <Text variant="h2">🔐 Naka-lock na</Text>
          {circle.order_mode === 'draw' ? (
            <>
              <Text tone="muted">
                Ito ang “commitment” ng bunot. Naka-publish na ito bago pa ang draw, kaya hindi na mababago ang resulta.
              </Text>
              <View style={[styles.hash, { backgroundColor: c.surfaceAlt }]}>
                <Text variant="small" style={{ fontFamily: 'monospace' }} selectable>
                  {circle.seed_hash}
                </Text>
              </View>
            </>
          ) : (
            <Text tone="muted">Hinihintay ang admin na ayusin ang pagkakasunod ng sahod.</Text>
          )}
          {isAdmin ? (
            <>
              <Button
                title={circle.order_mode === 'draw' ? t('circle.draw') : t('circle.setOrder')}
                icon={circle.order_mode === 'draw' ? 'shuffle' : 'list'}
                variant="accent"
                onPress={() => router.push(`/circle/${id}/draw`)}
              />
              <Button title={t('circle.unlock')} variant="ghost" size="md" onPress={() => confirmAction('I-unlock?', 'Babalik sa pag-iipon ng members.', 'unlock_circle')} />
            </>
          ) : (
            <Button title="Panoorin ang bunot" icon="eye" variant="secondary" onPress={() => router.push(`/circle/${id}/draw`)} />
          )}
        </Card>
      )}

      {/* ---------- ACTIVE: current round ---------- */}
      {circle.status === 'active' && current && (
        <Card style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="caption" tone="muted">
              Round {current.round_no} · {longDate(current.due_date)}
            </Text>
            <Text variant="smallBold" tone="muted">
              {relativeDue(current.due_date, lang)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flexDirection: 'row' }}>
              {recipients.map((m, i) => (
                <View key={m.id} style={{ marginLeft: i ? -12 : 0 }}>
                  <Avatar emoji={m.profiles?.avatar_emoji} size={52} bg={c.accent} ring={c.surface} />
                </View>
              ))}
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="small" tone="muted">
                May sahod ngayon
              </Text>
              <Text variant="h2">{iAmRecipient ? 'Ikaw! 🎉' : slotName(recipients)}</Text>
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <ProgressBar progress={confirmed / Math.max(1, roundKs.length)} color={c.success} height={10} />
            <Text variant="smallBold" tone="muted">
              {confirmed}/{roundKs.length} bayad na ·{' '}
              {peso(roundKs.filter((k) => k.status === 'confirmed').reduce((s, k) => s + Number(k.amount), 0))} ng{' '}
              {peso(potOf(circle))}
            </Text>
          </View>

          {iAmRecipient ? (
            <Button
              title={toReview ? `I-confirm ang ${toReview} na bayad` : 'Tingnan ang mga bayad'}
              icon="check-circle"
              variant={toReview ? 'accent' : 'secondary'}
              onPress={() => router.push(`/circle/${id}/round/${current.id}`)}
            />
          ) : myK ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <StatusChip status={displayStatus(myK, current, circle)} />
                {myK.status === 'rejected' && myK.reject_reason ? (
                  <Text variant="small" tone="danger" style={{ marginTop: 4 }}>
                    {myK.reject_reason}
                  </Text>
                ) : null}
              </View>
              {(myK.status === 'pending' || myK.status === 'rejected') && (
                <Button title={`${t('circle.pay')} ${peso(myK.amount)}`} full={false} icon="send" onPress={() => setPayOpen(true)} />
              )}
            </View>
          ) : null}

          {(isAdmin || iAmRecipient) && confirmed < roundKs.length && (
            <Button
              title={`${t('circle.nudge')} sa hindi pa bayad 👋`}
              variant="ghost"
              size="md"
              loading={nudge.isPending}
              onPress={() =>
                nudge.mutate(current.id, {
                  onSuccess: (r) => Alert.alert('Napadala!', `${r.sent} member ang napaalalahanan.`),
                  onError: (e) => Alert.alert('Hindi napadala', errMsg(e)),
                })
              }
            />
          )}
          {isAdmin && !iAmRecipient && (
            <Button title="Buksan ang round (admin)" variant="ghost" size="sm" onPress={() => router.push(`/circle/${id}/round/${current.id}`)} />
          )}
        </Card>
      )}

      {circle.status === 'active' && pendingSwaps > 0 && (
        <Card onPress={() => router.push(`/circle/${id}/swaps`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 24, lineHeight: 30 }}>🔁</Text>
          <Text variant="bodyBold" style={{ flex: 1 }}>
            {pendingSwaps} palit-slot na naghihintay
          </Text>
        </Card>
      )}

      {circle.status === 'completed' && (
        <Card tint="leaf" style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 48, lineHeight: 58 }}>🏁</Text>
          <Text variant="h2">Tapos na ang paluwagan!</Text>
          <Text tone="muted" center>
            Lahat ng {rounds.length} rounds ay kumpleto. Salamat sa tiwala, mga ka-circle!
          </Text>
        </Card>
      )}

      {/* ---------- Tabs ---------- */}
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'timeline', label: t('circle.timeline') },
          { value: 'members', label: t('circle.members') },
          { value: 'rules', label: t('circle.rules') },
          { value: 'activity', label: 'Log' },
        ]}
      />
      {tab === 'timeline' && <Timeline data={data} myGroup={me?.slot_group} />}
      {tab === 'members' && <MembersList data={data} userId={userId} />}
      {tab === 'rules' && <RulesPanel data={data} />}
      {tab === 'activity' && (
        <Card>
          <ActivityList items={activity.data ?? []} showCircle={false} />
        </Card>
      )}

      {current && myK && (
        <PaySheet open={payOpen} onClose={() => setPayOpen(false)} circle={circle} round={current} contribution={myK} recipients={recipients} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: 20, gap: 18 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  hash: { padding: 12, borderRadius: radius.sm },
});
