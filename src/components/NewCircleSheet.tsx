import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

function Option({ icon, title, body, onPress }: { icon: 'plus' | 'log-in'; title: string; body: string; onPress: () => void }) {
  const c = useColors();
  return (
    <PressableScale onPress={onPress} style={[styles.option, { borderColor: c.border, backgroundColor: c.surface }]}>
      <View style={[styles.icon, { backgroundColor: c.brandSoft }]}>
        <Feather name={icon} size={20} color={c.brand} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="h3">{title}</Text>
        <Text variant="small" tone="muted">
          {body}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={c.textFaint} />
    </PressableScale>
  );
}

export function NewCircleSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const go = (path: '/create' | '/join') => {
    onClose();
    setTimeout(() => router.push(path), 160);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Get started" subtitle="Start a new circle or join an existing one.">
      <Option icon="plus" title="Create a circle" body="You’ll be the admin and can invite members." onPress={() => go('/create')} />
      <Option icon="log-in" title="Join with a code" body="Enter a 6-character invite code or scan a QR." onPress={() => go('/join')} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.lg, borderWidth: 1 },
  icon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
