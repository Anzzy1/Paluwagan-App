import { router, type Href } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { BubbleButton, MascotBand, MASCOT_NAME } from '@/components/MascotBand';
import { Text } from '@/components/ui/Text';
import { useAiContext, useAiInsight } from '@/lib/ai';
import { useColors } from '@/lib/prefs';

/** Ipon's take: an on-demand AI insight on the user's savings, with a shortcut to the chat. */
export function InsightBand() {
  const c = useColors();
  const context = useAiContext();
  const insight = useAiInsight();

  const text = insight.isPending
    ? 'Looking at your circles and ipon…'
    : insight.error
      ? insight.error.message
      : (insight.data ?? 'Want a quick read on your savings? I’ll look at your circles and goals and tell you what to do next.');

  return (
    <MascotBand
      mood={insight.error ? 'worried' : insight.data ? 'excited' : 'happy'}
      pose="coin"
      trigger={text}
      action={insight.data ? 'toss' : 'wave'}
      busy={insight.isPending}
      title={`${MASCOT_NAME}’s take`}
      tag="AI"
      actions={
        <>
          <BubbleButton
            primary
            label={insight.data ? 'Refresh' : 'Analyze'}
            icon={insight.data ? 'refresh-cw' : 'zap'}
            left={insight.isPending ? <ActivityIndicator size="small" color={c.onBrand} /> : undefined}
            disabled={insight.isPending}
            onPress={() => insight.mutate(context)}
          />
          <BubbleButton label={`Ask ${MASCOT_NAME}`} icon="message-circle" onPress={() => router.push('/assistant' as Href)} />
        </>
      }>
      <Text variant="body" tone={insight.error ? 'danger' : 'default'} style={{ lineHeight: 22 }}>
        {text}
      </Text>
    </MascotBand>
  );
}
