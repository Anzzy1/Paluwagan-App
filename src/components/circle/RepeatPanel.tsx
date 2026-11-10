import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar, Chip, Input } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MonthCalendar } from '@/components/ui/MonthCalendar';
import { haptic, PressableScale } from '@/components/ui/PressableScale';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { confirmAction, notifyError } from '@/lib/alert';
import { useCircleAction, type CircleDetail } from '@/lib/api';
import { longDate, parseDate, shortDate, todayISO, toISODate } from '@/lib/format';
import { useColors } from '@/lib/prefs';

const plusDays = (d: string, n: number) => {
  const x = parseDate(d);
  x.setDate(x.getDate() + n);
  return toISODate(x);
};

/** Name, start date: shared by the online and offline "Start again" sheets. */
export function StartAgainSheet({
  open,
  onClose,
  defaultName,
  title,
  note,
  confirmLabel,
  loading,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  defaultName: string;
  title: string;
  note: string;
  confirmLabel: string;
  loading?: boolean;
  onConfirm: (name: string, start: string) => void;
}) {
  const today = todayISO();
  const [name, setName] = useState(defaultName);
  const [start, setStart] = useState(plusDays(today, 1));
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(defaultName);
      setStart(plusDays(today, 1));
    }
  }
  const trimmed = name.trim();
  const ok = trimmed.length >= 1 && trimmed.length <= 40 && start >= today;
  const choices: [string, string][] = [
    ['Tomorrow', plusDays(today, 1)],
    ['In 1 week', plusDays(today, 7)],
    ['In 2 weeks', plusDays(today, 14)],
  ];
  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle="Same group, same amount and schedule, with a new draw for the payout order.">
      <Input label="Name" value={name} onChangeText={setName} maxLength={40} placeholder="e.g. Barkada Paluwagan 2" />
      <View style={{ gap: 8 }}>
        <Text variant="smallBold">First hulog</Text>
        <View style={styles.wrapRow}>
          {choices.map(([label, d]) => (
            <PressableScale key={d} hapticOnPress={false} onPress={() => setStart(d)}>
              <Chip label={`${label} · ${shortDate(d)}`} tone={start === d ? 'ink' : 'neutral'} />
            </PressableScale>
          ))}
        </View>
        <Card>
          <MonthCalendar value={start} onChange={setStart} />
        </Card>
        {start < today && (
          <Text variant="small" tone="danger">
            Pick a date from today on.
          </Text>
        )}
      </View>
      <Text variant="small" tone="muted">
        {note}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Cancel" variant="secondary" full={false} style={{ flex: 1 }} onPress={onClose} />
        <Button title={confirmLabel} icon="refresh-cw" full={false} style={{ flex: 1.4 }} disabled={!ok} loading={loading} onPress={() => onConfirm(trimmed, start)} />
      </View>
    </Sheet>
  );
}

/**
 * Online "Start again" (0022): the admin asks, every member answers, then the admin starts a
 * new paluwagan with the members who said yes.
 */
export function RepeatPanel({ data, userId, isAdmin }: { data: CircleDetail; userId: string | null; isAdmin: boolean }) {
  const c = useColors();
  const { circle } = data;
  const action = useCircleAction(circle.id);
  const [askOpen, setAskOpen] = useState(false);
  const members = data.members.filter((m) => m.status === 'approved');
  const me = members.find((m) => m.user_id === userId);
  const yes = members.filter((m) => m.repeat_vote === true);
  const waiting = members.filter((m) => m.repeat_vote == null);
  const newName = circle.repeat_name ?? circle.name;
  const run = (fn: string, args: Record<string, unknown>, failed: string, onSuccess?: (data: unknown) => void) =>
    action.mutate({ fn, args: { p_circle: circle.id, ...args } }, { onSuccess: (d) => onSuccess?.(d), onError: (e) => notifyError(e, failed) });

  // Already started again.
  if (circle.repeat_circle) {
    const joined = me?.repeat_vote === true;
    return (
      <Card style={{ gap: 10 }}>
        <View style={styles.titleRow}>
          <Feather name="refresh-cw" size={18} color={c.brand} />
          <Text variant="h3">This group started again</Text>
        </View>
        <Text variant="small" tone="muted">
          {joined ? `“${newName}” is set up with everyone who said yes. Next: the admin locks it and runs a new draw.` : `“${newName}” started without you.`}
        </Text>
        {joined && <Button title="Open the new paluwagan" icon="arrow-right" variant="brand" size="md" onPress={() => router.push(`/circle/${circle.repeat_circle}` as Href)} />}
      </Card>
    );
  }

  // Waiting for answers.
  if (circle.repeat_requested_at) {
    const canStart = waiting.length === 0 && yes.length >= 3;
    const start = () =>
      confirmAction(
        `Start “${newName}”?`,
        `${yes.length} members said yes. A new paluwagan starts on ${longDate(circle.repeat_start ?? todayISO())} with them; then you lock it and run the draw.`,
        () =>
          run('start_repeat', {}, 'Couldn’t start it', (id) => {
            haptic('success');
            if (typeof id === 'string') router.push(`/circle/${id}` as Href);
          }),
        { confirmText: 'Start new paluwagan', icon: 'refresh-cw' },
      );
    return (
      <Card padded={false}>
        <View style={[styles.head, { backgroundColor: c.surfaceAlt }]}>
          <Feather name="refresh-cw" size={18} color={c.brand} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="h3">Start again?</Text>
            <Text variant="caption" tone="muted">
              “{newName}” · first hulog {longDate(circle.repeat_start ?? todayISO())} · new draw
            </Text>
          </View>
          <Chip label={waiting.length ? `${waiting.length} waiting` : 'All answered'} tone={waiting.length ? 'warning' : 'success'} />
        </View>
        {members.map((m) => (
          <View key={m.id} style={[styles.row, { borderTopColor: c.border }]}>
            <Avatar name={m.profiles?.full_name} seed={m.user_id} uri={m.profiles?.avatar_url} size={32} />
            <Text variant="bodyBold" style={{ flex: 1 }} numberOfLines={1}>
              {m.profiles?.full_name ?? 'Member'}
              {m.user_id === userId ? ' (you)' : ''}
            </Text>
            <Chip
              label={m.repeat_vote === true ? 'In' : m.repeat_vote === false ? 'Sitting out' : 'Waiting'}
              tone={m.repeat_vote === true ? 'success' : m.repeat_vote === false ? 'neutral' : 'warning'}
              icon={m.repeat_vote === true ? 'check' : m.repeat_vote === false ? 'x' : 'clock'}
            />
          </View>
        ))}
        <View style={[styles.actions, { borderTopColor: c.border }]}>
          {me && me.repeat_vote == null && (
            <>
              <Text variant="small" style={{ width: '100%' }}>
                Will you join the next paluwagan?
              </Text>
              <Button title="Count me in" icon="check" variant="brand" size="md" full={false} style={{ flex: 1 }} loading={action.isPending} onPress={() => run('answer_repeat', { p_yes: true }, 'Couldn’t save your answer')} />
              <Button title="Not this time" variant="secondary" size="md" full={false} style={{ flex: 1 }} onPress={() => run('answer_repeat', { p_yes: false }, 'Couldn’t save your answer')} />
            </>
          )}
          {me && me.repeat_vote != null && !isAdmin && (
            <>
              <Text variant="small" tone="muted" style={{ flex: 1, alignSelf: 'center' }}>
                You said {me.repeat_vote ? 'you’re in' : 'you’ll sit this one out'}.
              </Text>
              <Button title="Change answer" size="sm" variant="secondary" full={false} onPress={() => run('answer_repeat', { p_yes: !me.repeat_vote }, 'Couldn’t save your answer')} />
            </>
          )}
          {isAdmin && (
            <>
              <Button title="Start new paluwagan" icon="refresh-cw" variant="brand" size="md" full={false} style={{ flex: 1 }} disabled={!canStart} loading={action.isPending} onPress={start} />
              <Button
                title="Cancel"
                variant="ghost"
                size="md"
                full={false}
                onPress={() => confirmAction('Cancel starting again?', 'Everyone’s answers are cleared.', () => run('cancel_repeat', {}, 'Couldn’t cancel'), { confirmText: 'Cancel request' })}
              />
              {!canStart && (
                <Text variant="caption" tone="faint" style={{ width: '100%' }}>
                  {waiting.length ? 'You can start once every member has answered.' : 'At least 3 members need to say yes.'}
                </Text>
              )}
            </>
          )}
        </View>
      </Card>
    );
  }

  if (!isAdmin) return null;
  return (
    <Card style={{ gap: 10 }}>
      <View style={styles.titleRow}>
        <Feather name="refresh-cw" size={18} color={c.brand} />
        <Text variant="h3">Run it again?</Text>
      </View>
      <Text variant="small" tone="muted">
        Start a new paluwagan with the same group, amount and schedule, with a new draw. Every member is asked first, and it shows in their notifications.
      </Text>
      <Button title="Start again with the same group" icon="refresh-cw" variant="brand" size="md" onPress={() => setAskOpen(true)} />
      <StartAgainSheet
        open={askOpen}
        onClose={() => setAskOpen(false)}
        defaultName={circle.name}
        title="Start again"
        note="Every member gets a notification to say yes or no. Once everyone has answered, you start it with those who said yes."
        confirmLabel="Ask the members"
        loading={action.isPending}
        onConfirm={(name, start) =>
          run('request_repeat', { p_name: name, p_start: start }, 'Couldn’t ask the members', () => {
            haptic('success');
            setAskOpen(false);
          })
        }
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 14, borderTopWidth: 1 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
