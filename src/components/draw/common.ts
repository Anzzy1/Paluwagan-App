import type { DrawStyle, LegacyDrawStyle } from '@/lib/local';

export type Participant = { id: string; name: string };

/** Props shared by every draw game. `order` is the provably-fair payout order (participant ids). */
export type DrawGameProps = {
  participants: Participant[];
  order: string[];
  onDone: () => void;
};

export const LANE_COLORS = ['#16A34A', '#F2711C', '#2F6FEB', '#E5365F', '#7350E8', '#D9961A', '#0FA3B1', '#C2410C', '#4D7C0F', '#BE185D'];
export const colorAt = (i: number) => LANE_COLORS[i % LANE_COLORS.length];

export type GameId = Exclude<DrawStyle, LegacyDrawStyle>;

/** Map a stored style (possibly a retired one) to a game we still have. */
export function gameOf(style: DrawStyle | null | undefined): GameId {
  if (style === 'race') return 'slots';
  if (style === 'balls' || !style) return 'plinko';
  return style;
}

export const DRAW_STYLES: { id: GameId; title: string; body: string }[] = [
  { id: 'wheel', title: 'Spin the Wheel', body: 'Spin for each slot. Winners leave the wheel.' },
  { id: 'envelopes', title: 'Lucky Envelopes', body: 'Each member taps their sealed envelope to reveal their number.' },
  { id: 'slots', title: 'Slot Machine', body: 'Pull the lever. The name reel stops last.' },
  { id: 'plinko', title: 'Plinko Drop', body: 'A coin bounces down the pegs into a name.' },
  { id: 'claw', title: 'Claw Machine', body: 'The claw hunts, grabs a capsule and drops it in.' },
];

export function shortName(n: string, max = 11) {
  const t = n.trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}
