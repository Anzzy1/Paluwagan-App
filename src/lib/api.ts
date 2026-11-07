import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuth } from '@/lib/auth';
import { assertLive, demoQuery, demoState } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type {
  Activity,
  Circle,
  CirclePreview,
  Contribution,
  Deposit,
  Frequency,
  Goal,
  PlanFrequency,
  Member,
  Round,
  Swap,
} from '@/lib/types';

const MEMBER_SELECT = '*, profiles(*)';

function must<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

// ---------------------------------------------------------------- queries

export type MyCircle = { membership: Member; circle: Circle; rounds: Round[]; contributions: Contribution[] };

/** Everything the Home + Circles tabs need, in 3 round-trips. */
export function useMyCircles() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['my-circles', userId],
    enabled: !!userId,
    queryFn: async ({ queryKey }): Promise<MyCircle[]> => {
      if (demoState.on) return demoQuery(queryKey) as never;
      const memberships = must(
        await supabase
          .from('circle_members')
          .select('*, profiles(*), circles(*)')
          .eq('user_id', userId!)
          .eq('status', 'approved')
          .order('joined_at', { ascending: false }),
      ) as (Member & { circles: Circle })[];
      const ids = memberships.map((m) => m.circle_id);
      if (!ids.length) return [];
      const [rounds, contributions] = await Promise.all([
        supabase.from('rounds').select('*').in('circle_id', ids).order('round_no'),
        supabase.from('contributions').select('*').in('circle_id', ids).eq('user_id', userId!),
      ]);
      const rs = must(rounds) as Round[];
      const ks = must(contributions) as Contribution[];
      return memberships.map(({ circles, ...membership }) => ({
        membership: membership as Member,
        circle: circles,
        rounds: rs.filter((r) => r.circle_id === circles.id),
        contributions: ks.filter((k) => k.circle_id === circles.id),
      }));
    },
  });
}

export type CircleDetail = {
  circle: Circle;
  members: Member[];
  rounds: Round[];
  contributions: Contribution[];
  swaps: Swap[];
};

export function useCircle(id: string | undefined) {
  return useQuery({
    queryKey: ['circle', id],
    enabled: !!id,
    queryFn: async ({ queryKey }): Promise<CircleDetail> => {
      if (demoState.on) return demoQuery(queryKey) as never;
      const [c, m, r, k, s] = await Promise.all([
        supabase.from('circles').select('*').eq('id', id!).single(),
        supabase.from('circle_members').select(MEMBER_SELECT).eq('circle_id', id!).order('joined_at'),
        supabase.from('rounds').select('*').eq('circle_id', id!).order('round_no'),
        supabase.from('contributions').select('*').eq('circle_id', id!),
        supabase.from('swap_requests').select('*').eq('circle_id', id!).order('created_at', { ascending: false }),
      ]);
      return {
        circle: must(c) as Circle,
        members: must(m) as Member[],
        rounds: must(r) as Round[],
        contributions: must(k) as Contribution[],
        swaps: must(s) as Swap[],
      };
    },
  });
}

export function useActivity(circleId?: string) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['activity', userId, circleId ?? 'all'],
    enabled: !!userId,
    queryFn: async ({ queryKey }) => {
      if (demoState.on) return demoQuery(queryKey) as never;
      let q = supabase
        .from('activity')
        .select('*, circles(name, emoji, color), profiles(full_name, avatar_emoji)')
        .order('created_at', { ascending: false })
        .limit(80);
      if (circleId) q = q.eq('circle_id', circleId);
      return must(await q) as Activity[];
    },
  });
}

export function useGoals() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['goals', userId],
    enabled: !!userId,
    queryFn: async ({ queryKey }) => {
      if (demoState.on) return demoQuery(queryKey) as never;
      return must(await supabase.from('goals').select('*').order('created_at', { ascending: false })) as Goal[];
    },
  });
}

/** Every personal ipon deposit/withdrawal of the user, newest first. */
export function useDeposits() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['deposits', userId],
    enabled: !!userId,
    queryFn: async ({ queryKey }) => {
      if (demoState.on) return demoQuery(queryKey) as never;
      return must(await supabase.from('goal_deposits').select('*').order('created_at', { ascending: false })) as Deposit[];
    },
  });
}

export function usePreview(code: string) {
  const clean = code.trim().toUpperCase();
  return useQuery({
    queryKey: ['preview', clean],
    enabled: clean.length === 6,
    retry: false,
    queryFn: async ({ queryKey }) => {
      if (demoState.on) return demoQuery(queryKey) as never;
      const rows = must(await supabase.rpc('preview_circle', { p_code: clean })) as CirclePreview[];
      return rows[0] ?? null;
    },
  });
}

/** Signed URL for a private receipt. */
export function useReceiptUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['receipt', path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async ({ queryKey }) => {
      if (demoState.on) return demoQuery(queryKey) as Promise<string>;
      const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

// ---------------------------------------------------------------- realtime

/** Invalidate cached queries whenever a row the user can see changes. */
export function useRealtimeSync() {
  const qc = useQueryClient();
  const { userId } = useAuth();
  useEffect(() => {
    if (!userId || demoState.on) return;
    const channel = supabase.channel(`sync-${userId}`);
    const tables = ['circles', 'circle_members', 'rounds', 'contributions', 'swap_requests', 'activity'];
    for (const table of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        const row = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as {
          circle_id?: string;
          id?: string;
        };
        const circleId = table === 'circles' ? row?.id : row?.circle_id;
        if (circleId) qc.invalidateQueries({ queryKey: ['circle', circleId] });
        qc.invalidateQueries({ queryKey: ['my-circles'] });
        if (table === 'activity') qc.invalidateQueries({ queryKey: ['activity'] });
      });
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, userId]);
}

// ---------------------------------------------------------------- mutations

function useInvalidate() {
  const qc = useQueryClient();
  return (circleId?: string) => {
    if (circleId) qc.invalidateQueries({ queryKey: ['circle', circleId] });
    qc.invalidateQueries({ queryKey: ['my-circles'] });
    qc.invalidateQueries({ queryKey: ['activity'] });
  };
}

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  assertLive();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export type NewCircle = {
  name: string;
  emoji: string;
  color: string;
  amount: number;
  slots: number;
  frequency: Frequency;
  start_date: string;
  late_fee: number;
  grace_days: number;
  rules: string;
  order_mode: 'draw' | 'manual';
  interval_days: number | null;
  payout_frequency: Frequency | null;
  payout_interval_days: number | null;
  first_payout_date: string | null;
  password: string;
};

export function useCreateCircle() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (c: NewCircle) =>
      rpc<string>('create_circle', {
        p_name: c.name,
        p_emoji: c.emoji,
        p_color: c.color,
        p_amount: c.amount,
        p_slots: c.slots,
        p_frequency: c.frequency,
        p_start_date: c.start_date,
        p_late_fee: c.late_fee,
        p_grace_days: c.grace_days,
        p_rules: c.rules,
        p_order_mode: c.order_mode,
        p_interval_days: c.interval_days,
        p_payout_frequency: c.payout_frequency,
        p_payout_interval: c.payout_interval_days,
        p_first_payout: c.first_payout_date,
        p_password: c.password,
      }),
    onSuccess: () => invalidate(),
  });
}

export function useJoinCircle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { code: string; hati: boolean; password: string }) => {
      const id = await rpc<string | null>('request_join', { p_code: v.code, p_hati: v.hati, p_password: v.password || null });
      // The server returns null (not an error) for a wrong password so it can count attempts.
      if (!id) throw new Error('Incorrect password. Ask your paluwagan admin for the right one.');
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['preview'] }),
  });
}

/** Generic circle action — every RPC that only needs invalidation afterwards. */
export function useCircleAction(circleId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ fn, args }: { fn: string; args: Record<string, unknown> }) => rpc(fn, args),
    onSuccess: () => invalidate(circleId),
  });
}

export function useSubmitProof(circleId: string) {
  const { userId } = useAuth();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { contributionId: string; uri: string; mime?: string | null; note?: string }) => {
      assertLive();
      const ext = v.mime?.includes('png') ? 'png' : 'jpg';
      const path = `${circleId}/${userId}/${v.contributionId}-${Date.now()}.${ext}`;
      const body = await (await fetch(v.uri)).arrayBuffer();
      const up = await supabase.storage
        .from('receipts')
        .upload(path, body, { contentType: v.mime ?? `image/${ext}`, upsert: false });
      if (up.error) throw up.error;
      await rpc('submit_proof', { p_contribution: v.contributionId, p_proof_path: path, p_note: v.note ?? null });
    },
    onSuccess: () => invalidate(circleId),
  });
}

export function useNudge() {
  return useMutation({
    mutationFn: async (roundId: string) => {
      assertLive();
      const { data, error } = await supabase.functions.invoke('push', { body: { mode: 'nudge', round_id: roundId } });
      if (error) throw error;
      return data as { sent: number };
    },
  });
}

export function useUpdateProfile() {
  const { userId, refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (patch: Partial<{ full_name: string; avatar_emoji: string; gcash_number: string | null; push_token: string | null }>) => {
      assertLive();
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId!);
      if (error) throw error;
    },
    onSuccess: () => refreshProfile(),
  });
}

/** Path inside the `avatars` bucket for one of our own public URLs, or null for anything else. */
function avatarPath(url: string | null | undefined) {
  const marker = '/storage/v1/object/public/avatars/';
  const i = url?.indexOf(marker) ?? -1;
  return url && i >= 0 ? decodeURIComponent(url.slice(i + marker.length).split('?')[0]) : null;
}

/** Upload a new profile picture (uri from the image picker), or pass null to remove it. */
export function useSetAvatar() {
  const { userId, profile, refreshProfile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (img: { uri: string; mime?: string | null } | null) => {
      assertLive();
      const old = avatarPath(profile?.avatar_url);
      let url: string | null = null;
      if (img) {
        const ext = img.mime?.includes('png') ? 'png' : img.mime?.includes('webp') ? 'webp' : 'jpg';
        const path = `${userId}/${Date.now()}.${ext}`;
        const body = await (await fetch(img.uri)).arrayBuffer();
        const up = await supabase.storage.from('avatars').upload(path, body, { contentType: img.mime ?? `image/${ext}`, upsert: false });
        if (up.error) throw up.error;
        url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId!);
      if (error) throw error;
      // Best effort: the old file is no longer referenced.
      if (old) await supabase.storage.from('avatars').remove([old]);
    },
    onSuccess: async () => {
      await refreshProfile();
      // Member lists embed profiles, so refresh them to show the new photo everywhere.
      qc.invalidateQueries();
    },
  });
}

export function useSaveGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (g: {
      id?: string;
      title: string;
      target: number;
      emoji: string;
      circle_id: string | null;
      deadline?: string | null;
      plan_amount?: number | null;
      plan_frequency?: PlanFrequency | null;
    }) => {
      assertLive();
      const { error } = g.id
        ? await supabase.from('goals').update(g).eq('id', g.id)
        : await supabase.from('goals').insert(g);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      assertLive();
      const { error } = await supabase.from('goals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
}

export function useAddDeposit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { goal_id: string; amount: number; note?: string | null }) => {
      assertLive();
      const { error } = await supabase.from('goal_deposits').insert({ goal_id: d.goal_id, amount: d.amount, note: d.note?.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deposits'] }),
  });
}

export function useDeleteDeposit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      assertLive();
      const { error } = await supabase.from('goal_deposits').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deposits'] }),
  });
}

/** Admin: set, change or remove (empty string) the circle's join password. */
export function useSetCirclePassword(circleId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (password: string) => rpc('set_circle_password', { p_circle: circleId, p_password: password || null }),
    onSuccess: () => invalidate(circleId),
  });
}
