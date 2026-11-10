import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { haptic } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { notifyError } from '@/lib/alert';
import { useCircleAction, type CircleDetail } from '@/lib/api';
import { firstName, peso, shortDate } from '@/lib/format';
import { useColors } from '@/lib/prefs';

/**
 * Money to hand out (0026): refunds to members who left and the split of what they left behind.
 * The admin marks each one as given, and every member sees it. Shown until everything is given.
 */
export function FundGives({ data, userId }: { data: CircleDetail; userId: string | null }) {
  const c = useColors();
  const action = useCircleAction(data.circle.id);
  const gives = data.gives ?? [];
  const me = data.members.find((m) => m.user_id === userId && m.status === 'approved');
  const isAdmin = me?.role === 'admin';
  const nameOf = (uid: string | null) => data.members.find((m) => m.user_id === uid)?.profiles?.full_name || 'Member';

  // Group by adjustment; hide the ones fully given.
  const groups = (data.adjustments ?? [])
    .filter((a) => a.kind === 'refund' || a.kind === 'split')
    .map((a) => ({ a, rows: gives.filter((g) => g.adjustment_id === a.id) }))
    .filter((x) => x.rows.length && x.rows.some((g) => !g.given_at));
  if (!me || !groups.length) return null;

  const mark = (id: string, given: boolean) =>
    action.mutate({ fn: 'mark_given', args: { p_give: id, p_given: given } }, { onSuccess: () => haptic('success'), onError: (e) => notifyError(e, 'Couldn’t update') });

  return (
    <Card style={{ gap: 14 }}>
      <View style={styles.row}>
        <Feather name="send" size={17} color={c.brand} />
        <Text variant="h3" style={{ flex: 1 }}>
          Money to hand out
        </Text>
      </View>
      <Text variant="small" tone="muted">
        {isAdmin ? 'Mark each one as given once you hand it over, so everyone can see it.' : 'The admin marks each one as given once it’s handed over.'}
      </Text>
      {groups.map(({ a, rows }) => {
        const left = rows.filter((g) => !g.given_at).reduce((s, g) => s + Number(g.amount), 0);
        return (
          <View key={a.id} style={{ gap: 8 }}>
            <Text variant="smallBold">
              {a.kind === 'refund'
                ? a.reason === 'Refund when leaving'
                  ? `Refund to ${firstName(nameOf(a.user_id))}`
                  : `Given back: ${a.reason.toLowerCase()}`
                : `${firstName(nameOf(a.user_id))}’s ${peso(Number(a.amount))}, split among ${rows.length} members`}
              <Text variant="small" tone="faint">
                {' '}· {shortDate(a.created_at.slice(0, 10))}
                {rows.length > 1 ? ` · ${peso(left)} left to give` : ''}
              </Text>
            </Text>
            {rows.map((g) => {
              const mine = g.user_id === userId;
              return (
                <View key={g.id} style={[styles.row, mine && { backgroundColor: c.surfaceAlt, borderRadius: 10, padding: 6, marginHorizontal: -6 }]}>
                  <Avatar name={nameOf(g.user_id)} seed={g.user_id ?? g.id} size={28} />
                  <View style={{ flex: 1 }}>
                    <Text variant="body" numberOfLines={1}>
                      {mine ? 'You' : nameOf(g.user_id)}
                    </Text>
                    <Text variant="caption" tone={g.given_at ? 'success' : 'faint'}>
                      {g.given_at ? `Given ${shortDate(g.given_at.slice(0, 10))}` : 'Not given yet'}
                    </Text>
                  </View>
                  <Text variant="bodyBold" style={{ fontVariant: ['tabular-nums'] }}>
                    {peso(Number(g.amount))}
                  </Text>
                  {isAdmin &&
                    (g.given_at ? (
                      <Button title="Undo" size="sm" variant="ghost" full={false} onPress={() => mark(g.id, false)} />
                    ) : (
                      <Button title="Mark given" size="sm" variant="secondary" full={false} loading={action.isPending && action.variables?.args?.p_give === g.id} onPress={() => mark(g.id, true)} />
                    ))}
                </View>
              );
            })}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
