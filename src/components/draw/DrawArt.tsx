import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import type { DrawStyle } from '@/lib/local';

/** Soft background tint behind each game's illustration. */
export const DRAW_TINT: Record<DrawStyle, { light: string; dark: string }> = {
  wheel: { light: '#EAF1FE', dark: '#14213A' },
  race: { light: '#FFF1E2', dark: '#2E1E0E' },
  envelopes: { light: '#FFECF0', dark: '#33141C' },
  balls: { light: '#E5F6EB', dark: '#11291A' },
};

const SLICES = ['#22C55E', '#F2711C', '#2F6FEB', '#E5365F', '#7350E8', '#F5B53D'];

/**
 * Flat, two-tone illustrations for the draw (bunutan) games, drawn on a 64px grid.
 * Used instead of emoji so they look the same on every device and match the app.
 */
export function DrawArt({ style, size = 56 }: { style: DrawStyle; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {style === 'wheel' && <Wheel />}
      {style === 'race' && <Race />}
      {style === 'envelopes' && <Envelope />}
      {style === 'balls' && <Balls />}
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

function Race() {
  return (
    <G>
      {/* speed lines */}
      <Path d="M6 26h12M3 34h14M7 42h10" stroke="#F2711C" strokeOpacity={0.45} strokeWidth={3} strokeLinecap="round" />
      {/* pole */}
      <Rect x={21} y={8} width={4} height={50} rx={2} fill="#5B4636" />
      <Circle cx={23} cy={8} r={3.2} fill="#F5B53D" />
      {/* checkered flag */}
      <Path d="M25 11c8-4 14 4 22 0s12-2 12-2v22s-4-2-12 2-14-4-22 0z" fill="#FFFFFF" stroke="#1F2937" strokeWidth={2} strokeLinejoin="round" />
      <G fill="#1F2937">
        <Rect x={25} y={12} width={8.5} height={6.5} />
        <Rect x={42} y={12} width={8.5} height={6.5} />
        <Rect x={33.5} y={18.5} width={8.5} height={6.5} />
        <Rect x={50.5} y={18.5} width={8} height={6.5} />
        <Rect x={25} y={25} width={8.5} height={6.5} />
        <Rect x={42} y={25} width={8.5} height={6.5} />
      </G>
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

function Ball({ cx, cy, r, color, n }: { cx: number; cy: number; r: number; color: string; n: string }) {
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} fill={color} />
      <Circle cx={cx - r * 0.35} cy={cy - r * 0.4} r={r * 0.22} fill="#FFFFFF" fillOpacity={0.35} />
      <Circle cx={cx} cy={cy} r={r * 0.5} fill="#FFFFFF" />
      <SvgText x={cx} y={cy + r * 0.2} textAnchor="middle" fontWeight="900" fontSize={r * 0.6} fill="#1F2937">
        {n}
      </SvgText>
    </G>
  );
}

function Balls() {
  return (
    <G>
      <Ball cx={20} cy={42} r={13} color="#2F6FEB" n="3" />
      <Ball cx={44} cy={42} r={13} color="#F2711C" n="7" />
      <Ball cx={32} cy={21} r={14} color="#22C55E" n="1" />
    </G>
  );
}
