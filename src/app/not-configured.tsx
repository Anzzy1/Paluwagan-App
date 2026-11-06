import { View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';

export default function NotConfigured() {
  return (
    <Screen title="Halos handa na! 🛠️" subtitle="Kailangan munang i-connect ang Supabase backend.">
      <Card tint="mango">
        <Text variant="h3">1. Gumawa ng Supabase project</Text>
        <Text tone="muted">supabase.com → New project (free tier).</Text>
      </Card>
      <Card tint="sky">
        <Text variant="h3">2. I-run ang database migration</Text>
        <Text tone="muted">Kopyahin ang supabase/migrations/0001_init.sql sa SQL Editor at i-Run.</Text>
      </Card>
      <Card tint="leaf">
        <Text variant="h3">3. Gumawa ng .env.local</Text>
        <View style={{ marginTop: 6 }}>
          <Text variant="small" style={{ fontFamily: 'monospace' }}>
            EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co{'\n'}EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
          </Text>
        </View>
      </Card>
      <Text tone="muted" center>
        Pagkatapos, i-restart ang `npx expo start`.
      </Text>
    </Screen>
  );
}
