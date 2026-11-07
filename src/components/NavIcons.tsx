import Svg, { Circle, Path } from 'react-native-svg';

export type NavIconName = 'home' | 'circles' | 'ipon' | 'assistant' | 'activity' | 'profile' | 'create' | 'join' | 'pay' | 'settings';

type Props = { name: NavIconName; color: string; size?: number; active?: boolean; /** Stroke width override for bolder glyphs. */ weight?: number };

/**
 * Navigation icons: rounded outline when idle, "bulk" duotone (soft fill + solid detail) when active.
 * Drawn on a 24px grid so they stay crisp at any size.
 */
export function NavIcon({ name, color, size = 24, active = false, weight }: Props) {
  const soft = active ? 0.32 : 0;
  const sw = weight ?? (active ? 1.9 : 1.8);
  const stroke = { stroke: color, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'home' && (
        <>
          <Path d="M4 10.4 12 4l8 6.4v8.1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill={color} fillOpacity={soft} {...stroke} />
          <Path d="M9.8 20.5v-3.9a2.2 2.2 0 0 1 4.4 0v3.9" fill={active ? color : 'none'} {...stroke} />
        </>
      )}

      {name === 'circles' && (
        <>
          <Circle cx={12} cy={12.6} r={6.6} fill={color} fillOpacity={soft} {...stroke} />
          <Circle cx={12} cy={6} r={active ? 2.9 : 2.5} fill={color} />
          <Circle cx={6.3} cy={15.9} r={active ? 2.9 : 2.5} fill={color} />
          <Circle cx={17.7} cy={15.9} r={active ? 2.9 : 2.5} fill={color} />
        </>
      )}

      {name === 'ipon' && (
        <>
          <Path
            d="M4.6 12.4c0-3.3 3-5.4 6.9-5.4h1.7c3 0 5.3 1.6 6 4h1.3v3.6h-1.6a5.6 5.6 0 0 1-2.1 2.3v2.6h-2.6v-1.6h-3.6v1.6H8v-2.5c-2-1.1-3.4-2.6-3.4-4.6z"
            fill={color}
            fillOpacity={soft}
            {...stroke}
          />
          <Path d="M9.9 9.9h3.2" {...stroke} />
          <Circle cx={16.4} cy={11.6} r={1} fill={color} />
          <Circle cx={12} cy={3.4} r={1.9} fill={active ? color : 'none'} {...stroke} strokeWidth={1.6} />
        </>
      )}

      {name === 'assistant' && (
        <>
          <Path d="M12 4.2c4.4 0 8 3.1 8 7.1s-3.6 7.1-8 7.1c-1 0-2-.2-2.9-.5L5 19.6l1.1-3.6C4.8 14.7 4 13.1 4 11.3c0-4 3.6-7.1 8-7.1z" fill={color} fillOpacity={soft} {...stroke} />
          <Path d="M12 8.2c.3 1.6 1.1 2.4 2.7 2.7-1.6.3-2.4 1.1-2.7 2.7-.3-1.6-1.1-2.4-2.7-2.7 1.6-.3 2.4-1.1 2.7-2.7z" fill={color} stroke={color} strokeWidth={1.2} strokeLinejoin="round" />
        </>
      )}

      {name === 'create' && (
        <>
          <Circle cx={12} cy={12} r={8.6} fill={color} fillOpacity={soft} {...stroke} />
          <Path d="M12 8.2v7.6M8.2 12h7.6" {...stroke} />
        </>
      )}

      {name === 'join' && (
        <>
          <Path d="M13.6 4h3.9a2.5 2.5 0 0 1 2.5 2.5v11a2.5 2.5 0 0 1-2.5 2.5h-3.9z" fill={color} fillOpacity={soft} {...stroke} />
          <Path d="M4 12h10M10.6 8.4 14.2 12l-3.6 3.6" {...stroke} />
        </>
      )}

      {name === 'pay' && (
        <>
          <Path d="M20.2 3.8 4.4 10.1c-.8.3-.8 1.4 0 1.7l5.9 2.1 2.1 5.9c.3.8 1.4.8 1.7 0z" fill={color} fillOpacity={soft} {...stroke} />
          <Path d="m10.3 13.9 4.4-4.4" {...stroke} />
        </>
      )}

      {name === 'settings' && (
        <>
          <Path
            d="M10.3 3.9a1.8 1.8 0 0 1 3.4 0l.3.9a1.8 1.8 0 0 0 2.4 1l.8-.4a1.8 1.8 0 0 1 2.4 2.4l-.4.8a1.8 1.8 0 0 0 1 2.4l.9.3a1.8 1.8 0 0 1 0 3.4l-.9.3a1.8 1.8 0 0 0-1 2.4l.4.8a1.8 1.8 0 0 1-2.4 2.4l-.8-.4a1.8 1.8 0 0 0-2.4 1l-.3.9a1.8 1.8 0 0 1-3.4 0l-.3-.9a1.8 1.8 0 0 0-2.4-1l-.8.4a1.8 1.8 0 0 1-2.4-2.4l.4-.8a1.8 1.8 0 0 0-1-2.4l-.9-.3a1.8 1.8 0 0 1 0-3.4l.9-.3a1.8 1.8 0 0 0 1-2.4l-.4-.8a1.8 1.8 0 0 1 2.4-2.4l.8.4a1.8 1.8 0 0 0 2.4-1z"
            fill={color}
            fillOpacity={soft}
            {...stroke}
          />
          <Circle cx={12} cy={12} r={2.8} fill={active ? color : 'none'} {...stroke} />
        </>
      )}

      {name === 'activity' && (
        <>
          <Circle cx={12} cy={12} r={8.4} fill={color} fillOpacity={soft} {...stroke} />
          <Path d="M12 7.6V12l3 1.9" {...stroke} strokeWidth={active ? 2.2 : sw} />
        </>
      )}

      {name === 'profile' && (
        <>
          <Path d="M5 19.4c0-3.2 3.1-5.4 7-5.4s7 2.2 7 5.4a1.1 1.1 0 0 1-1.1 1.1H6.1A1.1 1.1 0 0 1 5 19.4z" fill={color} fillOpacity={soft} {...stroke} />
          <Circle cx={12} cy={8} r={3.6} fill={active ? color : 'none'} {...stroke} />
        </>
      )}
    </Svg>
  );
}
