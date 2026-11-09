import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedMascot } from '@/components/AnimatedMascot';
import { Mascot } from '@/components/Mascot';
import { IconButton } from '@/components/ui/bits';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { confirmAction } from '@/lib/alert';
import { useAiContext, useAiSource, useChat, type ChatMessage } from '@/lib/ai';
import { useLocalAiConfig } from '@/lib/localAi';
import { useAuth } from '@/lib/auth';
import { firstName } from '@/lib/format';
import { useColors, useIsDesktop } from '@/lib/prefs';
import { font, radius } from '@/theme/tokens';

const SUGGESTIONS = [
  'What do I need to pay this week?',
  'Am I on track for my ipon goals?',
  'How can I save ₱10,000 in 3 months?',
  'When is my next payout and what should I do with it?',
  'Give me a budget tip for kinsenas pay.',
  'Is a paluwagan with 10% interest safe?',
];

function Bubble({ m }: { m: ChatMessage }) {
  const c = useColors();
  const mine = m.role === 'user';
  return (
    <Animated.View entering={FadeInUp.duration(220)} style={[styles.bubbleRow, mine && { justifyContent: 'flex-end' }]}>
      {!mine && (
        <View style={[styles.avatar, { backgroundColor: c.brandSoft }]}>
          <Mascot size={30} mood="happy" />
        </View>
      )}
      <View style={[styles.bubble, mine ? { backgroundColor: c.ink, borderBottomRightRadius: 6 } : { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderBottomLeftRadius: 6 }]}>
        <Text variant="body" color={mine ? c.onInk : c.text} selectable style={{ lineHeight: 22 }}>
          {m.content}
        </Text>
      </View>
    </Animated.View>
  );
}

function AssistantScreen() {
  const c = useColors();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const context = useAiContext();
  const { messages, send, clear } = useChat();
  const source = useAiSource();
  const localAi = useLocalAiConfig();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages.length, send.isPending]);

  const submit = (value = text) => {
    const q = value.trim();
    if (!q || send.isPending) return;
    setText('');
    setError(null);
    send.mutate(
      { text: q, context },
      {
        onError: (e) => {
          setError(e.message);
          setText(q); // give the question back so it can be re-sent
        },
      },
    );
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg, paddingTop: desktop ? 0 : insets.top }}>
      {/* header */}
      <View style={[styles.header, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        <View style={[styles.col, styles.headerInner]}>
          <IconButton icon={desktop ? 'arrow-left' : 'chevron-down'} onPress={goBack} label="Close" />
          <View style={[styles.avatar, { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandSoft }]}>
            <AnimatedMascot size={40} mood={send.isPending ? 'neutral' : 'happy'} trigger={messages.length} busy={send.isPending} action="wave" idle={false} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="h3">Ipon</Text>
            <Text variant="caption" tone={send.isPending ? 'brand' : 'faint'}>
              {send.isPending ? 'Typing…' : source === 'local' ? `Offline · local AI (${localAi.model})` : 'Online · knows your paluwagan & ipon'}
            </Text>
          </View>
          {messages.length > 0 && (
            <IconButton icon="trash-2" label="Clear chat" onPress={() => confirmAction('Clear this chat?', 'Ipon will forget this conversation.', clear, { confirmText: 'Clear', destructive: true })} />
          )}
        </View>
      </View>

      {/* messages */}
      <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 20, paddingHorizontal: desktop ? 40 : 16 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.col, { gap: 12 }]}>
          {messages.length === 0 && (
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 12 }}>
              <AnimatedMascot size={120} mood="happy" action="wave" repeatEvery={7000} />
              <Text variant="h2" center>
                Hi {firstName(profile?.full_name)}! Ask me anything about your money.
              </Text>
              <Text tone="muted" center style={{ maxWidth: 440 }}>
                I can see your paluwagan, dues, payouts and ipon goals, so my advice fits your real situation.
              </Text>
              <View style={styles.suggestions}>
                {SUGGESTIONS.map((s) => (
                  <PressableScale key={s} onPress={() => submit(s)} hapticOnPress={false} style={[styles.suggestion, { backgroundColor: c.surface, borderColor: c.border }]}>
                    <Feather name="message-circle" size={14} color={c.brand} />
                    <Text variant="smallBold" style={{ flexShrink: 1 }}>
                      {s}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            </View>
          )}
          {messages.map((m, i) => (
            <Bubble key={`${m.at}-${i}`} m={m} />
          ))}
          {send.isPending && (
            <View style={styles.bubbleRow}>
              <View style={[styles.avatar, { backgroundColor: c.brandSoft }]}>
                <AnimatedMascot size={30} mood="neutral" busy idle={false} />
              </View>
              <View style={[styles.bubble, { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                <ActivityIndicator size="small" color={c.brand} />
                <Text variant="small" tone="muted">
                  {source === 'local' ? 'Ipon is thinking on this device… this can take up to a minute.' : 'Ipon is thinking…'}
                </Text>
              </View>
            </View>
          )}
          {error && (
            <View style={[styles.error, { backgroundColor: c.dangerBg }]}>
              <Feather name="alert-circle" size={16} color={c.danger} />
              <Text variant="small" tone="danger" style={{ flex: 1 }}>
                {error}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* composer */}
      <View style={[styles.composerWrap, { borderTopColor: c.border, backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[styles.col, styles.composer, { backgroundColor: c.surface, borderColor: c.border }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Ask Ipon about your savings…"
            placeholderTextColor={c.textFaint}
            multiline
            maxLength={2000}
            onKeyPress={(e) => {
              const ne = e.nativeEvent as { key: string; shiftKey?: boolean };
              if (Platform.OS === 'web' && ne.key === 'Enter' && !ne.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            style={[styles.input, { color: c.text, fontFamily: font.regular }, { outlineStyle: 'none' } as never]}
          />
          <PressableScale
            onPress={() => submit()}
            disabled={!text.trim() || send.isPending}
            accessibilityLabel="Send"
            style={[styles.send, { backgroundColor: text.trim() && !send.isPending ? c.brand : c.surfaceAlt }]}>
            <Feather name="arrow-up" size={20} color={text.trim() && !send.isPending ? c.onBrand : c.textFaint} />
          </PressableScale>
        </View>
        <Text variant="caption" tone="faint" center style={{ marginTop: 6 }}>
          {source === 'local' ? 'No internet: using the local AI, which is simpler and slower. ' : ''}Ipon is an AI and can make mistakes. It isn’t a licensed financial adviser.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  col: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  headerInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8, maxWidth: 620 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.lg, borderWidth: 1, maxWidth: '100%' },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.md },
  composerWrap: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 10 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderWidth: 1, borderRadius: 24, paddingLeft: 16, paddingRight: 6, paddingVertical: 6 },
  input: { flex: 1, fontSize: 15, minHeight: 36, maxHeight: 120, paddingVertical: 8 },
  send: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});

// Works offline too: without internet it uses the local AI (Ollama).
export default AssistantScreen;
