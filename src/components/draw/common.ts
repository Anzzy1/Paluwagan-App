import type { DrawStyle } from '@/lib/local';

export type Participant = { id: string; name: string };

/** Props shared by every draw game. `order` is the provably-fair payout order (participant ids). */
export type DrawGameProps = {
  participants: Participant[];
  order: string[];
  onDone: () => void;
};

export const LANE_COLORS = ['#16A34A', '#F2711C', '#2F6FEB', '#E5365F', '#7350E8', '#D9961A', '#0FA3B1', '#C2410C', '#4D7C0F', '#BE185D'];
export const colorAt = (i: number) => LANE_COLORS[i % LANE_COLORS.length];

export const DRAW_STYLES: { id: DrawStyle; title: string; body: string }[] = [
  { id: 'wheel', title: 'Spin the Wheel', body: 'Spin for each slot. Winners leave the wheel.' },
  { id: 'race', title: 'Horse Race', body: 'Everyone gets a horse. First to finish gets paid first.' },
  { id: 'envelopes', title: 'Lucky Envelopes', body: 'Each member taps their sealed envelope to reveal their number.' },
  { id: 'balls', title: 'Lottery Balls', body: 'Numbered balls drop out one by one.' },
];

export function shortName(n: string, max = 11) {
  const t = n.trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}
