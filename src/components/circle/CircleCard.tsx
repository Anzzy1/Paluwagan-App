import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { iconOf } from '@/components/ui/bits';
import { useTint } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import type { MyCircle } from '@/lib/api';
import { summarize } from '@/lib/derive';
import { payoutShort, peso } from '@/lib/format';
import { radius } from '@/theme/tokens';

const W = '#FFFFFF';
const W70 = 'rgba(255,255,255,0.78)';

/** Colourful, card-like tile for a circle (think bank card). */
export function CircleCard({ mc, style }: { mc: MyCircle; style?: ViewStyle }) {
  const tint = useTint(mc.circle.color);
  const s = summarize(mc);
  const { circle } = mc;
  const total = mc.rounds.length || circle.slots;
  const running = circle.status === 'active' || circle.status === 'completed';
  const status =
    circle.status === 'forming' ? 'Open for members' : circle.status === 'locked' ? 'Ready to draw' : circle.status === 'completed' ? 'Completed' : null;

  return (
    <PressableScale onPress={() => router.push(`/circle/${circle.id}`)} scaleTo={0.98} hapticOnPress={false} style={[styles.shadow, { shadowColor: tint.strong }, style]}>
      <LinearGradient colors={tint.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        {/* decorative coins */}
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
              {peso(circle.amount)} · {payoutShort(circle)}
            </Text>
          </View>
          {mc.membership.role === 'admin' && (
            <View style={styles.pill}>
              <Text variant="caption" color={W}>
                Admin
              </Text>
            </View>
          )}
        </View>

        <View style={{ gap: 2 }}>
          <Text variant="overline" color={W70}>
            Payout per round
          </Text>
          <Text variant="display" color={W} style={{ fontVariant: ['tabular-nums'] }}>
            {peso(s.pot)}
          </Text>
        </View>

        {running ? (
          <View style={{ gap: 8 }}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${(s.completedRounds / total) * 100}%` }]} />
            </View>
            <View style={styles.row}>
              <Text variant="caption" color={W70}>
                {circle.status === 'completed' ? 'All rounds done' : `Round ${s.current?.round_no ?? s.completedRounds} of ${total}`}
              </Text>
              <Text variant="caption" color={W}>
                {s.roundsAway === 0
                  ? 'Your payout now!'
                  : s.roundsAway != null
                    ? `Your turn in ${s.roundsAway} ${s.roundsAway === 1 ? 'round' : 'rounds'}`
                    : 'Payout received ✓'}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.row}>
            <View style={styles.pill}>
              <Text variant="caption" color={W}>
                {status}
              </Text>
            </View>
            <Feather name="arrow-right" size={18} color={W} />
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
