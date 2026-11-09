import { Feather } from '@expo/vector-icons';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/lib/prefs';

/** Shown instead of a blank screen when a screen crashes: explain, and offer a way back. */
export function RouteError({ error, retry }: ErrorBoundaryProps) {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: c.bg }}>
      <View style={{ width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.dangerBg }}>
        <Feather name="alert-triangle" size={26} color={c.danger} />
      </View>
      <Text variant="h2" center>
        Something went wrong
      </Text>
      <Text tone="muted" center style={{ maxWidth: 360 }}>
        This screen couldn’t load. Your data is safe. Try again, or go back to Home.
      </Text>
      <Text variant="caption" tone="faint" center style={{ maxWidth: 360 }} selectable>
        {error.message}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <Button title="Go to Home" variant="secondary" full={false} onPress={() => router.replace('/')} />
        <Button title="Try again" icon="refresh-cw" full={false} onPress={retry} />
      </View>
    </View>
  );
}
