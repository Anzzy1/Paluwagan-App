import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { withAccount } from '@/components/AccountGate';
import { Avatar, IconButton, PurposeIcon } from '@/components/ui/bits';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { confirmAction, notifyError } from '@/lib/alert';
import { useCircle } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { MAX_MESSAGE, useChatRead, useCircleChat, useDeleteMessage, useSendMessage, type ChatMessage } from '@/lib/chat';
import { firstName } from '@/lib/format';
import { useColors, useIsDesktop } from '@/lib/prefs';
import type { Member } from '@/lib/types';
import { font, radius } from '@/theme/tokens';

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

/** A run of messages from the same person within a few minutes shows one name and avatar. */
const sameRun = (a: ChatMessage | undefined, b: ChatMessage) =>
  !!a && a.user_id === b.user_id && new Date(b.created_at).getTime() - new Date(a.created_at).getTime() < 5 * 60 * 1000;

function Bubble({
  m,
  mine,
  member,
  first,
  last,
  canDelete,
  onDelete,
}: {
  m: ChatMessage;
  mine: boolean;
  member?: Member;
  first: boolean;
  last: boolean;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const c = useColors();
  const name = member?.profiles?.full_name ?? 'Former member';
  return (
    <View style={[styles.row, mine && { justifyContent: 'flex-end' }, { marginTop: first ? 10 : 2 }]}>
      {!mine && (
        <View style={{ width: 32 }}>{last && <Avatar name={member?.profiles?.full_name} seed={m.user_id} uri={member?.profiles?.avatar_url} size={32} />}</View>
      )}
      <View style={{ maxWidth: '78%', alignItems: mine ? 'flex-end' : 'flex-start', gap: 3 }}>
        {first && !mine && (
          <Text variant="caption" tone="muted" style={{ marginLeft: 12 }}>
            {firstName(name)}
            {member?.role === 'admin' ? ' · Admin' : ''}
          </Text>
        )}
        <PressableScale
          onLongPress={canDelete ? onDelete : undefined}
          delayLongPress={350}
          disabled={!canDelete}
          dimWhenDisabled={false}
          hapticOnPress={false}
          scaleTo={0.98}
          accessibilityHint={canDelete ? 'Long press to delete' : undefined}
          style={[
            styles.bubble,
            mine
              ? { backgroundColor: c.brand, borderBottomRightRadius: last ? 6 : 20 }
              : { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderBottomLeftRadius: last ? 6 : 20 },
          ]}>
          <Text variant="body" color={mine ? c.onBrand : c.text} selectable style={{ lineHeight: 21 }}>
            {m.body}
          </Text>
        </PressableScale>
        {last && (
          <Text variant="caption" tone="faint" style={{ marginHorizontal: 6 }}>
            {time(m.created_at)}
          </Text>
        )}
      </View>
    </View>
  );
}

function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const circle = useCircle(id);
  const chat = useCircleChat(id);
  const send = useSendMessage(id);
  const remove = useDeleteMessage(id);
  const { markRead } = useChatRead(id);
  const [text, setText] = useState('');
  const scroller = useRef<ScrollViewInstance>(null);

  const messages = chat.data ?? [];
  const members = circle.data?.members ?? [];
  const byUser = new Map(members.map((m) => [m.user_id, m]));
  const me = members.find((m) => m.user_id === userId);
  const isAdmin = me?.role === 'admin';
  const approved = members.filter((m) => m.status === 'approved');

  // Keep the newest message in view and mark the chat read while it's open.
  useEffect(() => {
    markRead();
    const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: messages.length > 0 }), 60);
    return () => clearTimeout(t);
  }, [messages.length, markRead]);

  const submit = () => {
    const body = text.trim();
    if (!body || send.isPending) return;
    setText('');
    send.mutate(body, {
      onError: (e) => {
        setText(body); // give it back so it can be re-sent
        notifyError(e, 'Message not sent');
      },
    });
  };

  const askDelete = (m: ChatMessage) =>
    confirmAction(
      'Delete this message?',
      m.user_id === userId ? 'It will be removed for everyone.' : 'As the admin, you can remove messages that break the group’s rules. It will be removed for everyone.',
      () => remove.mutate(m.id, { onError: (e) => notifyError(e, 'Couldn’t delete message') }),
      { confirmText: 'Delete', destructive: true },
    );

  const goBack = () => (router.canGoBack() ? router.back() : router.replace(`/circle/${id}`));

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg, paddingTop: desktop ? 0 : insets.top }}>
      <View style={[styles.header, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        <View style={[styles.col, styles.headerInner]}>
          <IconButton icon="arrow-left" onPress={goBack} label="Back" />
          <View style={[styles.circleIcon, { backgroundColor: c.brandSoft }]}>
            <PurposeIcon icon={circle.data?.circle.emoji ?? 'users'} size={18} color={c.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="h3" numberOfLines={1}>
              {circle.data?.circle.name ?? 'Group chat'}
            </Text>
            <Text variant="caption" tone="faint">
              Group chat · {approved.length} member{approved.length === 1 ? '' : 's'}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 16, paddingHorizontal: desktop ? 40 : 14, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.col, { flexGrow: 1 }]}>
          {chat.isPending ? (
            <ActivityIndicator style={{ marginTop: 60 }} color={c.brand} />
          ) : chat.isError ? (
            <View style={styles.empty}>
              <Feather name="alert-circle" size={28} color={c.danger} />
              <Text tone="muted" center>
                Couldn’t load the chat. If it was just added, the admin of the app still needs to run the latest database update.
              </Text>
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: c.brandSoft }]}>
                <Feather name="message-circle" size={26} color={c.brand} />
              </View>
              <Text variant="h3" center>
                Say hi to the group
              </Text>
              <Text tone="muted" center style={{ maxWidth: 320 }}>
                Only members of this paluwagan can see these messages. Use it for reminders, payment notes and updates.
              </Text>
            </View>
          ) : (
            messages.map((m, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
              const mine = m.user_id === userId;
              return (
                <View key={m.id}>
                  {newDay && (
                    <View style={styles.day}>
                      <Text variant="caption" tone="faint" style={[styles.dayPill, { backgroundColor: c.surfaceAlt }]}>
                        {dayLabel(m.created_at)}
                      </Text>
                    </View>
                  )}
                  <Bubble
                    m={m}
                    mine={mine}
                    member={byUser.get(m.user_id)}
                    first={newDay || !sameRun(prev, m)}
                    last={!next || !sameRun(m, next) || new Date(next.created_at).toDateString() !== new Date(m.created_at).toDateString()}
                    canDelete={mine || isAdmin}
                    onDelete={() => askDelete(m)}
                  />
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <View style={[styles.composerWrap, { borderTopColor: c.border, backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[styles.col, styles.composer, { backgroundColor: c.surface, borderColor: c.border }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message the group…"
            placeholderTextColor={c.textFaint}
            multiline
            maxLength={MAX_MESSAGE}
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
            onPress={submit}
            disabled={!text.trim() || send.isPending}
            accessibilityLabel="Send"
            style={[styles.send, { backgroundColor: text.trim() && !send.isPending ? c.brand : c.surfaceAlt }]}>
            <Feather name="arrow-up" size={20} color={text.trim() && !send.isPending ? c.onBrand : c.textFaint} />
          </PressableScale>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  col: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  headerInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  circleIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubble: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  day: { alignItems: 'center', marginTop: 14, marginBottom: 4 },
  dayPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 40 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  composerWrap: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 10 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderWidth: 1, borderRadius: 24, paddingLeft: 16, paddingRight: 6, paddingVertical: 6 },
  input: { flex: 1, fontSize: 15, minHeight: 36, maxHeight: 120, paddingVertical: 8 },
  send: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});

export default withAccount(ChatScreen, 'Group chat');
