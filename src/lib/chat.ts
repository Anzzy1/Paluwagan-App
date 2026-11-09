import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useId, useState } from 'react';

import { assertLive, demoState } from '@/lib/demo';
import { kv } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

/** One message in a paluwagan's group chat (table circle_messages, migration 0009). */
export type ChatMessage = { id: string; circle_id: string; user_id: string; body: string; created_at: string };

/** How many recent messages to load. */
const LIMIT = 200;
export const MAX_MESSAGE = 1000;

const key = (circleId: string) => ['chat', circleId] as const;

/** Recent messages, oldest first, kept live with Realtime while mounted. */
export function useCircleChat(circleId: string | undefined, enabled = true) {
  const qc = useQueryClient();
  const on = !!circleId && enabled && !demoState.on;
  // Each hook gets its own channel. supabase.channel() reuses an existing channel with the same
  // topic, and adding listeners to one that's already subscribed throws, which blanked the screen
  // when the chat card and the chat screen were both mounted.
  const instance = useId().replace(/[^a-zA-Z0-9]/g, '');

  const q = useQuery({
    queryKey: key(circleId ?? ''),
    enabled: on,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('circle_messages')
        .select('*')
        .eq('circle_id', circleId!)
        .order('created_at', { ascending: false })
        .limit(LIMIT);
      if (error) throw error;
      return (data as ChatMessage[]).reverse();
    },
  });

  useEffect(() => {
    if (!on) return;
    const channel = supabase
      .channel(`chat-${circleId}-${instance}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'circle_messages', filter: `circle_id=eq.${circleId}` }, (payload) => {
        const m = payload.new as ChatMessage;
        qc.setQueryData<ChatMessage[]>(key(circleId!), (old = []) => (old.some((x) => x.id === m.id) ? old : [...old, m]));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'circle_messages', filter: `circle_id=eq.${circleId}` }, (payload) => {
        const id = (payload.old as Partial<ChatMessage>).id;
        if (id) qc.setQueryData<ChatMessage[]>(key(circleId!), (old = []) => old.filter((x) => x.id !== id));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [on, circleId, qc, instance]);

  return q;
}

export function useSendMessage(circleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      assertLive();
      const { data, error } = await supabase.from('circle_messages').insert({ circle_id: circleId, body }).select('*').single();
      if (error) throw error;
      return data as ChatMessage;
    },
    // Show it right away instead of waiting for the Realtime echo.
    onSuccess: (m) => qc.setQueryData<ChatMessage[]>(key(circleId), (old = []) => (old.some((x) => x.id === m.id) ? old : [...old, m])),
  });
}

export function useDeleteMessage(circleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      assertLive();
      const { error } = await supabase.from('circle_messages').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => qc.setQueryData<ChatMessage[]>(key(circleId), (old = []) => old.filter((x) => x.id !== id)),
  });
}

// ---------------------------------------------------------------- unread (per device)

const readKey = (circleId: string) => `chat-read-v1-${circleId}`;

/** When this device last opened the chat, and a way to mark it read now. */
export function useChatRead(circleId: string | undefined) {
  const [lastRead, setLastRead] = useState(() => (circleId ? (kv.get(readKey(circleId)) ?? '') : ''));
  // Re-read when the screen comes back into view (e.g. returning from the chat).
  useFocusEffect(
    useCallback(() => {
      if (circleId) setLastRead(kv.get(readKey(circleId)) ?? '');
    }, [circleId]),
  );
  const markRead = useCallback(() => {
    if (!circleId) return;
    const now = new Date().toISOString();
    kv.set(readKey(circleId), now);
    setLastRead(now);
  }, [circleId]);
  return { lastRead, markRead };
}

/** Messages from others newer than the last time this chat was opened here. */
export function unreadCount(messages: ChatMessage[] | undefined, lastRead: string, me: string | null) {
  if (!messages) return 0;
  return messages.filter((m) => m.user_id !== me && m.created_at > lastRead).length;
}
