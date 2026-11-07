import { View } from 'react-native';

import { Mascot } from '@/components/Mascot';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/lib/prefs';
import { font } from '@/theme/tokens';

export function Logo({ size = 30, inverted = false }: { size?: number; inverted?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Mascot size={size * 1.15} mood="happy" />
      <Text style={{ fontFamily: font.black, fontSize: size * 0.78, lineHeight: size, letterSpacing: -1.1 }} color={inverted ? '#FFFFFF' : c.text}>
        paluwagan
      </Text>
    </View>
  );
}
