import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { useColors } from '@/lib/prefs';
import { font } from '@/theme/tokens';

const variants = {
  hero: { fontFamily: font.extrabold, fontSize: 44, lineHeight: 48, letterSpacing: -1.5 },
  display: { fontFamily: font.extrabold, fontSize: 34, lineHeight: 40, letterSpacing: -1 },
  h1: { fontFamily: font.extrabold, fontSize: 26, lineHeight: 32, letterSpacing: -0.6 },
  h2: { fontFamily: font.bold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  h3: { fontFamily: font.bold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: font.medium, fontSize: 15, lineHeight: 22 },
  bodyBold: { fontFamily: font.bold, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  smallBold: { fontFamily: font.bold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.6, textTransform: 'uppercase' },
} satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof variants;
type Tone = 'default' | 'muted' | 'faint' | 'onInk' | 'success' | 'warning' | 'danger' | 'info' | 'accentInk';

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
    success: c.success,
    warning: c.warning,
    danger: c.danger,
    info: c.info,
    accentInk: c.accentInk,
  }[tone];
  return (
    <RNText
      {...rest}
      style={[variants[variant], { color: color ?? toneColor }, center && { textAlign: 'center' }, style]}
    />
  );
}
