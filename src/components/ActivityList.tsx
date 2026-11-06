import { Feather } from '@expo/vector-icons';
import { View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { describeActivity } from '@/lib/activityText';
import { timeAgo } from '@/lib/format';
import { useColors } from '@/lib/prefs';
import type { Activity } from '@/lib/types';

export function ActivityList({ items, showCircle = true }: { items: Activity[]; showCircle?: boolean }) {
  const c = useColors();
  const toneBg = { neutral: c.surfaceAlt, success: c.successBg, warning: c.warningBg, danger: c.dangerBg, info: c.infoBg, accent: c.accent };
  const toneFg = { neutral: c.textMuted, success: c.success, warning: c.warning, danger: c.danger, info: c.info, accent: c.accentInk };
  return (
    <View>
      {items.map((a, i) => {
        const d = describeActivity(a);
        return (
          <View key={a.id} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ alignItems: 'center' }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: toneBg[d.tone],
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Feather name={d.icon} size={16} color={toneFg[d.tone]} />
              </View>
              {i < items.length - 1 && <View style={{ width: 2, flex: 1, backgroundColor: c.border, marginVertical: 4 }} />}
            </View>
            <View style={{ flex: 1, paddingBottom: 18, paddingTop: 6 }}>
              <Text variant="bodyBold" style={{ fontSize: 14 }}>
                {d.text}
              </Text>
              <Text variant="small" tone="faint">
                {showCircle && a.circles ? `${a.circles.emoji} ${a.circles.name} · ` : ''}
                {timeAgo(a.created_at)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
