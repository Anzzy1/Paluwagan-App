import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { gameOf, type GameId } from '@/components/draw/common';
import type { DrawStyle } from '@/lib/local';

/** Soft background tint behind each game's illustration. */
export const DRAW_TINT: Record<GameId, { light: string; dark: string }> = {
  wheel: { light: '#EAF1FE', dark: '#14213A' },
  envelopes: { light: '#FFECF0', dark: '#33141C' },
  slots: { light: '#FFF1E2', dark: '#2E1E0E' },
  plinko: { light: '#E5F6EB', dark: '#11291A' },
  claw: { light: '#F1ECFF', dark: '#211A3D' },
};

const SLICES = ['#22C55E', '#F2711C', '#2F6FEB', '#E5365F', '#7350E8', '#F5B53D'];

/**
 * Flat, two-tone illustrations for the draw (bunutan) games, drawn on a 64px grid.
 * Used instead of emoji so they look the same on every device and match the app.
 */
export function DrawArt({ style, size = 56 }: { style: DrawStyle; size?: number }) {
  const game = gameOf(style);
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {game === 'wheel' && <Wheel />}
      {game === 'envelopes' && <Envelope />}
      {game === 'slots' && <Slots />}
      {game === 'plinko' && <PlinkoArt />}
      {game === 'claw' && <Claw />}
    </Svg>
  );
}

function Wheel() {
  const cx = 32;
  const cy = 34;
  const r = 24;
  const slice = (i: number) => {
    const a0 = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / 6) * Math.PI * 2 - Math.PI / 2;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    return `M${cx} ${cy}L${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z`;
  };
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r + 3} fill="#1E2A4A" />
      {SLICES.map((col, i) => (
        <Path key={i} d={slice(i)} fill={col} />
      ))}
      <Circle cx={cx} cy={cy} r={r} fill="none" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={1.2} />
      <Circle cx={cx} cy={cy} r={6.5} fill="#FFFFFF" />
      <Circle cx={cx} cy={cy} r={3} fill="#1E2A4A" />
      {/* pointer */}
      <Path d="M32 15 26.5 5.5h11z" fill="#1E2A4A" />
      <Path d="M32 12.5 28.8 7h6.4z" fill="#FFFFFF" />
    </G>
  );
}

function Envelope() {
  return (
    <G>
      <Rect x={10} y={10} width={44} height={46} rx={7} fill="#E5365F" />
      <Path d="M10 17a7 7 0 0 1 7-7h30a7 7 0 0 1 7 7v6L32 36 10 23z" fill="#C21F4A" />
      <Path d="M14 54h36" stroke="#C21F4A" strokeWidth={2} strokeLinecap="round" strokeOpacity={0.6} />
      <Circle cx={32} cy={35} r={9.5} fill="#F5B53D" stroke="#D9961A" strokeWidth={2} />
      <SvgText x={32} y={39.5} textAnchor="middle" fontWeight="900" fontSize={12.5} fill="#9A6406">
        ₱
      </SvgText>
    </G>
  );
}

function Slots() {
  return (
    <G>
      <Rect x={6} y={10} width={46} height={46} rx={9} fill="#E5365F" />
      <Rect x={6} y={10} width={46} height={10} rx={5} fill="#B3173F" />
      <Rect x={11} y={24} width={36} height={20} rx={4} fill="#FFFFFF" />
      <SvgText x={17.5} y={39} textAnchor="middle" fontWeight="900" fontSize={13} fill="#E5365F">
        7
      </SvgText>
      <SvgText x={29} y={39} textAnchor="middle" fontWeight="900" fontSize={13} fill="#16A34A">
        ₱
      </SvgText>
      <SvgText x={40.5} y={39} textAnchor="middle" fontWeight="900" fontSize={13} fill="#E5365F">
        7
      </SvgText>
      <Rect x={13} y={48} width={32} height={4} rx={2} fill="#B3173F" />
      {/* lever */}
      <Rect x={52} y={22} width={4} height={20} rx={2} fill="#9CA3AF" />
      <Circle cx={54} cy={20} r={5} fill="#F5B53D" stroke="#D9961A" strokeWidth={1.5} />
    </G>
  );
}

function PlinkoArt() {
  const pegs: [number, number][] = [];
  for (let r = 0; r < 4; r++) for (let k = 0; k < 5 - (r % 2); k++) pegs.push([14 + k * 9 + (r % 2 ? 4.5 : 0), 14 + r * 8]);
  return (
    <G>
      <Rect x={6} y={6} width={52} height={52} rx={9} fill="#1F2937" />
      {pegs.map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={1.8} fill="#FFFFFF" opacity={0.85} />
      ))}
      <Rect x={8} y={45} width={12} height={11} fill="#22C55E" />
      <Rect x={20} y={45} width={12} height={11} fill="#2F6FEB" />
      <Rect x={32} y={45} width={12} height={11} fill="#F2711C" />
      <Rect x={44} y={45} width={12} height={11} fill="#E5365F" />
      <Circle cx={36} cy={34} r={5} fill="#F6BE3B" stroke="#D9961A" strokeWidth={1.5} />
    </G>
  );
}

function Claw() {
  return (
    <G>
      <Rect x={6} y={6} width={52} height={5} rx={2.5} fill="#9CA3AF" />
      <Rect x={30.5} y={10} width={3} height={16} fill="#6B7280" />
      <Rect x={24} y={25} width={16} height={6} rx={3} fill="#4B5563" />
      <Path d="M27 30v8q0 5 5 7M37 30v8q0 5-5 7" stroke="#6B7280" strokeWidth={3} fill="none" strokeLinecap="round" />
      <Circle cx={32} cy={50} r={9} fill="#7350E8" stroke="#FFFFFF" strokeWidth={2} />
      <Circle cx={16} cy={53} r={6.5} fill="#22C55E" stroke="#FFFFFF" strokeWidth={1.5} />
      <Circle cx={48} cy={53} r={6.5} fill="#F2711C" stroke="#FFFFFF" strokeWidth={1.5} />
      <Circle cx={29} cy={47} r={2} fill="#FFFFFF" opacity={0.5} />
    </G>
  );
}
