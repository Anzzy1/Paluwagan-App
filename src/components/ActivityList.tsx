import { Feather } from '@expo/vector-icons';
import { View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { describeActivity } from '@/lib/activityText';
import { timeAgo } from '@/lib/format';
import { useColors } from '@/lib/prefs';
import type { Activity } from '@/lib/types';

export function ActivityList({ items, showCircle = true }: { items: Activity[]; showCircle?: boolean }) {
  const c = useColors();
  const toneBg = { neutral: c.surfaceAlt, success: c.successBg, warning: c.warningBg, danger: c.dangerBg, info: c.infoBg, brand: c.brandSoft };
  const toneFg = { neutral: c.textMuted, success: c.success, warning: c.warning, danger: c.danger, info: c.info, brand: c.brand };
  return (
    <View>
      {items.map((a, i) => {
        const d = describeActivity(a);
        return (
          <View key={a.id} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: toneBg[d.tone], alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={d.icon} size={15} color={toneFg[d.tone]} />
              </View>
              {i < items.length - 1 && <View style={{ width: 1, flex: 1, backgroundColor: c.border, marginVertical: 4 }} />}
            </View>
            <View style={{ flex: 1, paddingBottom: 18, paddingTop: 5, gap: 2 }}>
              <Text variant="bodyMedium" style={{ fontSize: 14, lineHeight: 20 }}>
                {d.text}
              </Text>
              <Text variant="small" tone="faint">
                {showCircle && a.circles ? `${a.circles.name} · ` : ''}
                {timeAgo(a.created_at)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
