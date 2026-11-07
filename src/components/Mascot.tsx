import { memo } from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';

/**
 * Ipon — the Paluwagan mascot, a squirrel.
 * Squirrels store food for later; Ipon stores coins: it's the saver who keeps you on track.
 */
export type MascotMood = 'happy' | 'excited' | 'worried' | 'sleepy' | 'neutral';
export type MascotPose = 'coin' | 'cheer';

export const FUR = '#C9733A';
export const FUR_DARK = '#94501F';
const FUR_LIGHT = '#E8A262';
export const CREAM = '#FBE6C8';
const CREAM_SHADE = '#F0CFA3';
const EAR_INNER = '#F3B38E';
const INK = '#2A1A10';
const NOSE = '#5B2E16';
const BLUSH = '#F49A86';
export const GOLD = '#F6BE3B';
export const GOLD_DARK = '#D9961A';

function MascotImpl({ size = 120, mood = 'happy', pose = 'coin', arms = true }: { size?: number; mood?: MascotMood; pose?: MascotPose; /** false: body only, so arms/coin can be animated as separate layers. */ arms?: boolean }) {
  const eyesOpen = mood !== 'sleepy' && mood !== 'excited';
  const smiling = mood === 'happy' || mood === 'excited';
  return (
    <Svg width={size} height={(size * 220) / 210} viewBox="0 0 210 220">
      {/* big fluffy tail, curling up behind */}
      <Path
        d="M132 198 C 186 200, 208 156, 198 114 C 190 80, 204 56, 188 36 C 172 16, 140 20, 136 46 C 133 66, 156 68, 160 86 C 164 104, 150 124, 136 146 Z"
        fill={FUR}
        stroke={FUR_DARK}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Path d="M148 186 C 182 182, 196 148, 188 114 C 182 88, 192 66, 180 50" fill="none" stroke={FUR_LIGHT} strokeWidth={9} strokeLinecap="round" opacity={0.85} />
      <Path d="M150 44 C 158 36, 170 36, 178 42" fill="none" stroke={FUR_DARK} strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
      <Path d="M190 130 C 194 120, 194 110, 190 100" fill="none" stroke={FUR_DARK} strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />

      {/* feet */}
      <Ellipse cx="74" cy="205" rx="18" ry="9" fill={FUR_DARK} />
      <Ellipse cx="118" cy="205" rx="18" ry="9" fill={FUR_DARK} />

      {/* body + belly */}
      <Ellipse cx="96" cy="162" rx="50" ry="46" fill={FUR} stroke={FUR_DARK} strokeWidth={3} />
      <Ellipse cx="96" cy="170" rx="31" ry="32" fill={CREAM} />

      {/* ears (behind head) */}
      <Path d="M54 66 L 60 16 L 92 46 Z" fill={FUR} stroke={FUR_DARK} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M62 56 L 65 28 L 84 46 Z" fill={EAR_INNER} />
      <Path d="M138 66 L 132 16 L 100 46 Z" fill={FUR} stroke={FUR_DARK} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M130 56 L 127 28 L 108 46 Z" fill={EAR_INNER} />
      {/* ear tufts */}
      <Path d="M60 18 C 56 10, 60 4, 66 2" fill="none" stroke={FUR_DARK} strokeWidth={3} strokeLinecap="round" />
      <Path d="M132 18 C 136 10, 132 4, 126 2" fill="none" stroke={FUR_DARK} strokeWidth={3} strokeLinecap="round" />

      {/* head */}
      <Circle cx="96" cy="90" r="54" fill={FUR} stroke={FUR_DARK} strokeWidth={3} />
      <Path d="M88 40 C 92 30, 100 30, 106 37" fill="none" stroke={FUR_DARK} strokeWidth={3} strokeLinecap="round" />
      <Path d="M62 58 C 72 46, 86 41, 98 41" fill="none" stroke={FUR_LIGHT} strokeWidth={4} strokeLinecap="round" opacity={0.8} />

      {/* cream face: eye patches + muzzle */}
      <Ellipse cx="74" cy="94" rx="17" ry="18" fill={CREAM} />
      <Ellipse cx="118" cy="94" rx="17" ry="18" fill={CREAM} />
      <Ellipse cx="96" cy="118" rx="30" ry="22" fill={CREAM} />

      {/* cheeks */}
      <Ellipse cx="62" cy="116" rx="10" ry="6.5" fill={BLUSH} opacity={0.7} />
      <Ellipse cx="130" cy="116" rx="10" ry="6.5" fill={BLUSH} opacity={0.7} />

      {/* eyes */}
      {mood === 'sleepy' && (
        <>
          <Path d="M64 96 Q 74 103 84 96" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
          <Path d="M108 96 Q 118 103 128 96" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
        </>
      )}
      {mood === 'excited' && (
        <>
          <Path d="M64 98 Q 74 86 84 98" fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" />
          <Path d="M108 98 Q 118 86 128 98" fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" />
        </>
      )}
      {eyesOpen &&
        [74, 118].map((cx) => (
          <G key={`e${cx}`}>
            <Ellipse cx={cx} cy="95" rx="10" ry="12" fill={INK} />
            <Circle cx={cx + 3.5} cy="90" r="4" fill="#FFFFFF" />
            <Circle cx={cx - 3.5} cy="99" r="1.8" fill="#FFFFFF" opacity={0.8} />
          </G>
        ))}
      {mood === 'worried' && (
        <>
          <Path d="M62 76 L 84 81" stroke={FUR_DARK} strokeWidth={3.5} strokeLinecap="round" />
          <Path d="M130 76 L 108 81" stroke={FUR_DARK} strokeWidth={3.5} strokeLinecap="round" />
        </>
      )}

      {/* nose + mouth */}
      <Ellipse cx="96" cy="113" rx="7" ry="5" fill={NOSE} />
      <Ellipse cx="94" cy="111.5" rx="2.2" ry="1.4" fill="#FFFFFF" opacity={0.6} />
      <Path d="M96 118 L 96 122" stroke={NOSE} strokeWidth={2.5} strokeLinecap="round" />
      {smiling ? (
        <>
          <Path d="M84 121 Q 90 128 96 122 Q 102 128 108 121" fill="none" stroke={NOSE} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
          {/* buck teeth */}
          <Rect x="91" y="124" width="10" height="9" rx="2" fill="#FFFFFF" stroke={NOSE} strokeWidth={1.8} />
          <Path d="M96 124 L 96 133" stroke={NOSE} strokeWidth={1.4} />
        </>
      ) : mood === 'worried' ? (
        <Path d="M88 130 Q 96 124 104 130" fill="none" stroke={NOSE} strokeWidth={3} strokeLinecap="round" />
      ) : (
        <Path d="M88 124 Q 96 128 104 124" fill="none" stroke={NOSE} strokeWidth={2.8} strokeLinecap="round" />
      )}
      <Ellipse cx="96" cy="138" rx="12" ry="3" fill={CREAM_SHADE} opacity={0.6} />

      {/* arms */}
      {!arms ? null : pose === 'cheer' ? (
        <>
          <Path d="M54 150 C 38 136, 32 118, 38 106" fill="none" stroke={FUR_DARK} strokeWidth={15} strokeLinecap="round" />
          <Path d="M138 150 C 154 136, 160 118, 154 106" fill="none" stroke={FUR_DARK} strokeWidth={15} strokeLinecap="round" />
          <Circle cx="38" cy="104" r="9" fill={CREAM} stroke={FUR_DARK} strokeWidth={2} />
          <Circle cx="154" cy="104" r="9" fill={CREAM} stroke={FUR_DARK} strokeWidth={2} />
        </>
      ) : (
        <>
          <Circle cx="96" cy="168" r="21" fill={GOLD} stroke={GOLD_DARK} strokeWidth={3} />
          <Circle cx="96" cy="168" r="14" fill="none" stroke={GOLD_DARK} strokeWidth={2} opacity={0.6} />
          <SvgText x="96" y="176" textAnchor="middle" fontWeight="900" fontSize="20" fill={GOLD_DARK}>
            ₱
          </SvgText>
          <Ellipse cx="72" cy="166" rx="10" ry="13" fill={FUR} stroke={FUR_DARK} strokeWidth={2.5} />
          <Ellipse cx="120" cy="166" rx="10" ry="13" fill={FUR} stroke={FUR_DARK} strokeWidth={2.5} />
        </>
      )}
    </Svg>
  );
}

export const Mascot = memo(MascotImpl);
