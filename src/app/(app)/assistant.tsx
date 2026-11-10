import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedMascot } from '@/components/AnimatedMascot';
import { BandScene, useBandColors } from '@/components/BandScene';
import { Mascot } from '@/components/Mascot';
import type { IconName } from '@/components/ui/bits';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { withAccount } from '@/components/AccountGate';
import { confirmAction } from '@/lib/alert';
import { useAiContext, useChat, type ChatMessage } from '@/lib/ai';
import { useAuth } from '@/lib/auth';
import { firstName } from '@/lib/format';
import { plainText } from '@/lib/plainText';
import { useColors, useIsDark, useIsDesktop } from '@/lib/prefs';
import { circleTints, font, radius, type CircleTint } from '@/theme/tokens';

type Suggestion = { q: string; icon: IconName; tint: CircleTint };

// Kept to three short starters so the empty chat stays compact.
const SUGGESTIONS: Suggestion[] = [
  { q: 'What do I need to pay this week?', icon: 'calendar', tint: 'mango' },
  { q: 'Am I on track for my ipon goals?', icon: 'target', tint: 'leaf' },
  { q: 'How can I save ₱10,000 in 3 months?', icon: 'trending-up', tint: 'sky' },
];

/** Short follow-ups shown above the composer once a conversation has started. */
const QUICK_REPLIES = ['Explain simpler', 'Give me steps', 'What else should I know?', 'Make a savings plan'];

function clock(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Three dots that bounce one after another while Ipon writes a reply. */
function TypingDots() {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', height: 18 }}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} delay={i * 160} color={c.brand} />
      ))}
    </View>
  );
}

function Dot({ delay, color }: { delay: number; color: string }) {
  const reduce = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    y.value = withDelay(delay, withRepeat(withSequence(withTiming(-5, { duration: 260 }), withTiming(0, { duration: 260 }), withTiming(0, { duration: 220 })), -1));
  }, [delay, reduce, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: 0.55 + (-y.value / 5) * 0.45 }));
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }, style]} />;
}

function Avatar({ size = 34, children }: { size?: number; children: React.ReactNode }) {
  const c = useColors();
  return (
    <LinearGradient colors={[c.featureA, c.featureB]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, borderColor: c.surface }]}>
      {children}
    </LinearGradient>
  );
}

function Bubble({ m, showAvatar, showTime }: { m: ChatMessage; showAvatar: boolean; showTime: boolean }) {
  const c = useColors();
  const dark = useIsDark();
  const mine = m.role === 'user';
  const time = showTime ? clock(m.at) : '';

  if (mine) {
    return (
      <Animated.View entering={FadeInUp.duration(240)} style={{ alignItems: 'flex-end', gap: 4 }}>
        <LinearGradient colors={['#2CC46A', '#13904A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bubble, styles.mine]}>
          <Text variant="body" color="#FFFFFF" selectable style={{ lineHeight: 22 }}>
            {m.content}
          </Text>
        </LinearGradient>
        {!!time && (
          <Text variant="caption" tone="faint" style={{ marginRight: 6 }}>
            {time}
          </Text>
        )}
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInUp.duration(260)} style={{ gap: 4 }}>
      <View style={styles.bubbleRow}>
        {showAvatar ? (
          <Avatar>
            <Mascot size={30} mood="happy" />
          </Avatar>
        ) : (
          <View style={{ width: 34 }} />
        )}
        <View
          style={[
            styles.bubble,
            styles.theirs,
            { backgroundColor: c.surface, borderColor: c.border, shadowColor: c.shadow, shadowOpacity: dark ? 0 : 0.06 },
          ]}>
          {/* Older saved replies may still contain markdown symbols. */}
          <Text variant="body" selectable style={{ lineHeight: 23 }}>
            {plainText(m.content)}
          </Text>
        </View>
      </View>
      {!!time && (
        <Text variant="caption" tone="faint" style={{ marginLeft: 48 }}>
          Ipon · {time}
        </Text>
      )}
    </Animated.View>
  );
}

function SuggestionTile({ s, index, onPress }: { s: Suggestion; index: number; onPress: () => void }) {
  const c = useColors();
  const t = circleTints[s.tint];
  return (
    <Animated.View entering={FadeInDown.delay(100 + index * 60).duration(300)}>
      <PressableScale onPress={onPress} hapticOnPress={false} style={[styles.tile, { backgroundColor: c.surface, borderColor: c.border }]}>
        <LinearGradient colors={t.grad as unknown as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tileIcon}>
          <Feather name={s.icon} size={14} color="#FFFFFF" />
        </LinearGradient>
        <Text variant="smallBold" numberOfLines={1} style={{ flex: 1 }}>
          {s.q}
        </Text>
        <Feather name="arrow-up-right" size={16} color={c.textFaint} />
      </PressableScale>
    </Animated.View>
  );
}

function AssistantScreen() {
  const c = useColors();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const band = useBandColors();
  const { profile } = useAuth();
  const context = useAiContext();
  const { messages, send, clear } = useChat();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
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
  const canSend = !!text.trim() && !send.isPending;
  const lastIsReply = messages.length > 0 && messages[messages.length - 1].role === 'assistant';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      {/* header: green band with Ipon, like the Home band */}
      <LinearGradient colors={band} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: (desktop ? 0 : insets.top) + 10 }]}>
        <BandScene />
        <View style={[styles.col, styles.headerInner]}>
          <PressableScale onPress={goBack} accessibilityLabel="Back" hapticOnPress={false} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={band[1]} />
          </PressableScale>
          <View style={styles.headerAvatar}>
            <AnimatedMascot size={46} mood={send.isPending ? 'neutral' : 'happy'} trigger={messages.length} busy={send.isPending} action="wave" idle={false} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="h2" color="#FFFFFF" style={{ fontFamily: font.cuteBold, letterSpacing: 0 }}>
              Ipon
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.statusDot, { backgroundColor: send.isPending ? '#FFD66B' : '#B6FFCF' }]} />
              <Text variant="caption" color="rgba(255,255,255,0.88)" numberOfLines={1}>
                {send.isPending ? 'Typing…' : 'Your AI money buddy'}
              </Text>
            </View>
          </View>
          {messages.length > 0 && (
            <PressableScale
              onPress={() => confirmAction('Clear this chat?', 'Ipon will forget this conversation.', clear, { confirmText: 'Clear', destructive: true })}
              accessibilityLabel="Clear chat"
              hapticOnPress={false}
              style={styles.glassBtn}>
              <Feather name="refresh-ccw" size={17} color="#FFFFFF" />
            </PressableScale>
          )}
        </View>
      </LinearGradient>

      {/* messages */}
      <ScrollView
        ref={scroller}
        style={[styles.sheet, { backgroundColor: c.bg }]}
        contentContainerStyle={{ paddingTop: 22, paddingBottom: 16, paddingHorizontal: desktop ? 40 : 16 }}
        keyboardShouldPersistTaps="handled">
        <View style={[styles.col, { gap: 10 }]}>
          {messages.length === 0 && (
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Animated.View entering={FadeIn.duration(400)} style={styles.heroWrap}>
                <LinearGradient colors={[c.featureA, c.featureB]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroBlob} />
                <AnimatedMascot size={92} mood="happy" action="wave" repeatEvery={7000} />
              </Animated.View>
              <Animated.View entering={FadeInDown.delay(60).duration(320)} style={{ alignItems: 'center', gap: 6 }}>
                <Text center style={{ fontFamily: font.cuteBold, fontSize: 22, lineHeight: 28 }}>
                  Hi {firstName(profile?.full_name)}!
                </Text>
                <Text variant="small" tone="muted" center style={{ maxWidth: 360 }}>
                  Ask me anything about your paluwagan, dues, payouts and ipon goals.
                </Text>
              </Animated.View>
              <View style={[styles.overlineRow, { marginTop: 10 }]}>
                <Feather name="zap" size={13} color={c.brandText} />
                <Text variant="overline" tone="brand">
                  Try asking
                </Text>
              </View>
              <View style={styles.tiles}>
                {SUGGESTIONS.map((s, i) => (
                  <SuggestionTile key={s.q} s={s} index={i} onPress={() => submit(s.q)} />
                ))}
              </View>
            </View>
          )}

          {messages.map((m, i) => {
            const next = messages[i + 1];
            const lastOfGroup = !next || next.role !== m.role;
            return <Bubble key={`${m.at}-${i}`} m={m} showAvatar={lastOfGroup} showTime={lastOfGroup} />;
          })}

          {send.isPending && (
            <Animated.View entering={FadeIn.duration(200)} style={styles.bubbleRow}>
              <Avatar>
                <AnimatedMascot size={30} mood="neutral" busy idle={false} />
              </Avatar>
              <View style={[styles.bubble, styles.theirs, { backgroundColor: c.surface, borderColor: c.border, paddingVertical: 14 }]}>
                <TypingDots />
              </View>
            </Animated.View>
          )}

          {error && (
            <Animated.View entering={FadeIn} style={[styles.error, { backgroundColor: c.dangerBg }]}>
              <Feather name="alert-circle" size={16} color={c.danger} />
              <Text variant="small" tone="danger" style={{ flex: 1 }}>
                {error}
              </Text>
              <PressableScale onPress={() => submit()} hapticOnPress={false} style={[styles.retry, { borderColor: c.danger }]}>
                <Text variant="caption" tone="danger">
                  Retry
                </Text>
              </PressableScale>
            </Animated.View>
          )}
        </View>
      </ScrollView>

      {/* composer */}
      <View style={[styles.composerWrap, { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.col}>
          {lastIsReply && !send.isPending && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }} keyboardShouldPersistTaps="handled">
              {QUICK_REPLIES.map((q) => (
                <PressableScale key={q} onPress={() => submit(q)} hapticOnPress={false} style={[styles.chip, { backgroundColor: c.brandSoft }]}>
                  <Text variant="caption" tone="brand">
                    {q}
                  </Text>
                </PressableScale>
              ))}
            </ScrollView>
          )}
          <View style={[styles.composer, { backgroundColor: c.surface, borderColor: focused ? c.brand : c.border, shadowColor: c.shadow }]}>
            <Feather name="message-circle" size={18} color={focused ? c.brand : c.textFaint} style={{ marginBottom: 10 }} />
            <TextInput
              value={text}
              onChangeText={setText}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
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
            <PressableScale onPress={() => submit()} disabled={!canSend} accessibilityLabel="Send">
              {canSend ? (
                <LinearGradient colors={['#2CC46A', '#13904A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.send}>
                  <Feather name="send" size={17} color="#FFFFFF" style={{ marginLeft: -2, marginTop: 1 }} />
                </LinearGradient>
              ) : (
                <View style={[styles.send, { backgroundColor: c.surfaceAlt }]}>
                  <Feather name="send" size={17} color={c.textFaint} style={{ marginLeft: -2, marginTop: 1 }} />
                </View>
              )}
            </PressableScale>
          </View>
          <Text variant="caption" tone="faint" center style={{ marginTop: 8, fontSize: 11 }}>
            Ipon is an AI and can make mistakes. It isn’t a licensed financial adviser.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  col: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { paddingHorizontal: 16, paddingBottom: 30, overflow: 'hidden' },
  headerInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  glassBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  headerAvatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  // the message area rises over the band like a sheet
  sheet: { flex: 1, marginTop: -20, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  bubble: { maxWidth: '80%', paddingHorizontal: 16, paddingVertical: 11, borderRadius: 22 },
  mine: { borderBottomRightRadius: 6 },
  theirs: { borderWidth: 1, borderBottomLeftRadius: 6, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, flexShrink: 1 },
  heroWrap: { width: 124, height: 110, alignItems: 'center', justifyContent: 'flex-end' },
  heroBlob: { position: 'absolute', width: 108, height: 108, borderRadius: 54, top: 0 },
  overlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tiles: { gap: 8, marginTop: 6, width: '100%', maxWidth: 440 },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 8, paddingRight: 12, borderRadius: radius.pill, borderWidth: 1 },
  tileIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.md },
  retry: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  composerWrap: { paddingHorizontal: 16, paddingTop: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 28,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  input: { flex: 1, fontSize: 15, minHeight: 36, maxHeight: 120, paddingVertical: 8 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});

// Needs an account and internet (Groq through the AI Edge Function).
export default withAccount(AssistantScreen, 'Ask Ipon');
