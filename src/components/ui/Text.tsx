import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { useColors } from '@/lib/prefs';
import { font } from '@/theme/tokens';

const num: TextStyle = { fontVariant: ['tabular-nums'] };

const variants = {
  hero: { fontFamily: font.black, fontSize: 42, lineHeight: 48, letterSpacing: -1.8, ...num },
  display: { fontFamily: font.black, fontSize: 34, lineHeight: 40, letterSpacing: -1.4 },
  h1: { fontFamily: font.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.9 },
  h2: { fontFamily: font.bold, fontSize: 20, lineHeight: 26, letterSpacing: -0.5 },
  h3: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.25 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 23 },
  bodyMedium: { fontFamily: font.medium, fontSize: 15, lineHeight: 22 },
  bodyBold: { fontFamily: font.semibold, fontSize: 15, lineHeight: 22, letterSpacing: -0.15 },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 19 },
  smallBold: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.medium, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.1, textTransform: 'uppercase' },
  money: { fontFamily: font.bold, fontSize: 16, lineHeight: 21, letterSpacing: -0.3, ...num },
  mono: { fontFamily: 'monospace', fontSize: 12, lineHeight: 18 },
} satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof variants;
type Tone = 'default' | 'muted' | 'faint' | 'onInk' | 'inkMuted' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export function Text({
  variant = 'body',
  tone = 'default',
  color,
  center,
  style,
  ...rest
}: TextProps & { variant?: TextVariant; tone?: Tone; color?: string; center?: boolean }) {
  const c = useColors();
  const toneColor = {
    default: c.text,
    muted: c.textMuted,
    faint: c.textFaint,
    onInk: c.onInk,
    inkMuted: c.inkMuted,
    brand: c.brandText,
    success: c.success,
    warning: c.warning,
    danger: c.danger,
    info: c.info,
  }[tone];
  return (
    <RNText {...rest} style={[variants[variant], { color: color ?? toneColor }, center && { textAlign: 'center' }, style]} />
  );
}
