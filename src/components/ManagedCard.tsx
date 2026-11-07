import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { iconOf } from '@/components/ui/bits';
import { useTint } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { payoutShort, peso } from '@/lib/format';
import { managedSummary, potOfManaged, type LocalCircle } from '@/lib/local';
import { radius } from '@/theme/tokens';

const W = '#FFFFFF';
const W70 = 'rgba(255,255,255,0.8)';

/** Card for an offline circle the user manages on this device. */
export function ManagedCard({ circle, style }: { circle: LocalCircle; style?: ViewStyle }) {
  const tint = useTint(circle.color);
  const s = managedSummary(circle);
  const n = circle.members.length;

  return (
    <PressableScale onPress={() => router.push(`/managed/${circle.id}` as Href)} scaleTo={0.98} hapticOnPress={false} style={[styles.shadow, { shadowColor: tint.strong }, style]}>
      <LinearGradient colors={tint.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={[styles.deco, { right: -30, top: -40, width: 140, height: 140 }]} />
        <View style={[styles.deco, { right: 40, bottom: -60, width: 110, height: 110 }]} />
        <View style={styles.top}>
          <View style={styles.icon}>
            <Feather name={iconOf(circle.emoji)} size={18} color={W} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="h3" color={W} numberOfLines={1}>
              {circle.name}
            </Text>
            <Text variant="caption" color={W70}>
              {peso(circle.amount)} · {payoutShort(circle)} · {n} members
            </Text>
          </View>
          <View style={[styles.pill, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
            <Feather name="smartphone" size={11} color={W} />
            <Text variant="caption" color={W}>
              Managed
            </Text>
          </View>
        </View>

        <View style={{ gap: 2 }}>
          <Text variant="overline" color={W70}>
            Payout per round
          </Text>
          <Text variant="display" color={W} style={{ fontVariant: ['tabular-nums'] }}>
            {peso(potOfManaged(circle, s.current ?? circle.rounds[0]))}
          </Text>
        </View>

        {circle.status === 'forming' ? (
          <View style={styles.row}>
            <View style={styles.pill}>
              <Text variant="caption" color={W}>
                Ready for the draw
              </Text>
            </View>
            <Feather name="arrow-right" size={18} color={W} />
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${(s.completed / Math.max(1, circle.rounds.length)) * 100}%` }]} />
            </View>
            <View style={styles.row}>
              <Text variant="caption" color={W70}>
                {circle.status === 'completed' ? 'All rounds done' : `Round ${s.current?.round_no} · ${s.paidCount}/${n} paid`}
              </Text>
              <Text variant="caption" color={W} numberOfLines={1}>
                {s.recipient ? `Payout: ${s.recipient.name}` : 'Completed ✓'}
              </Text>
            </View>
          </View>
        )}
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  shadow: { borderRadius: radius.xl, shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  card: { borderRadius: radius.xl, padding: 18, gap: 16, overflow: 'hidden', minHeight: 188 },
  deco: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  pill: { backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: '#FFFFFF' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
