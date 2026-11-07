import { useState } from 'react';
import { View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { Notice } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase';

const BACKEND_STEPS = [
  ['Create a Supabase project', 'supabase.com → New project (the free tier works).'],
  ['Run the database migrations', 'Run supabase/migrations/0001 and 0002 in the SQL Editor.'],
  ['Add your keys to .env.local', 'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then restart npx expo start.'],
];

const GUEST_STEPS = [
  ['Open your Supabase dashboard', 'Go to Authentication → Sign In / Providers.'],
  ['Enable anonymous sign-ins', 'Turn on “Allow anonymous sign-ins” and click Save.'],
  ['Come back and press Retry', 'The app will create a guest account and open straight away.'],
];

function Steps({ steps }: { steps: string[][] }) {
  return steps.map(([title, body], i) => (
    <Card key={title} style={{ flexDirection: 'row', gap: 14 }}>
      <Text variant="money" tone="brand">
        {i + 1}
      </Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="h3">{title}</Text>
        <Text variant="small" tone="muted">
          {body}
        </Text>
      </View>
    </Card>
  ));
}

export default function NotConfigured() {
  const { enterDemo, guestError, retryGuest } = useAuth();
  const [busy, setBusy] = useState(false);
  const guestMode = isSupabaseConfigured;

  const footer = (
    <>
      {guestMode && (
        <Button
          title="Retry"
          icon="refresh-cw"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await retryGuest();
            setBusy(false);
          }}
        />
      )}
      <Button title="Preview with sample data" icon="eye" variant="secondary" onPress={enterDemo} />
    </>
  );

  return (
    <AuthShell
      title={guestMode ? 'One setting to enable' : 'Connect your backend'}
      subtitle={
        guestMode
          ? 'During testing the app opens on a guest account, so no sign-in is required. Supabase needs anonymous sign-ins turned on for that.'
          : 'Paluwagan needs a Supabase project before it can store paluwagan.'
      }
      footer={footer}>
      <Steps steps={guestMode ? GUEST_STEPS : BACKEND_STEPS} />
      {guestMode && guestError && <Notice tone="warning" icon="alert-triangle" title="Supabase responded" body={guestError} />}
    </AuthShell>
  );
}
