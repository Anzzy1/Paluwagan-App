import { Feather, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import Svg, { Circle as SvgCircle } from 'react-native-svg';

import { Mascot } from '@/components/Mascot';
import { useTint } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { initials } from '@/lib/format';
import { useColors, useIsDark, useT } from '@/lib/prefs';
import type { DisplayStatus } from '@/lib/types';
import { circleTints, font, radius, tintNames } from '@/theme/tokens';

export type IconName = ComponentProps<typeof Feather>['name'];

/** Resolve a stored icon key (or a legacy emoji) to a Feather icon. */
export function iconOf(key?: string | null): IconName {
  return key && key in Feather.glyphMap ? (key as IconName) : 'dollar-sign';
}

/**
 * Purpose icons (what a paluwagan or goal is for) are stored as Feather names in the DB.
 * They're drawn with filled Ionicons, which read bolder and more modern at small sizes.
 */
const PURPOSE_GLYPH: Record<string, ComponentProps<typeof Ionicons>['name']> = {
  'dollar-sign': 'wallet',
  home: 'home',
  'book-open': 'school',
  briefcase: 'briefcase',
  umbrella: 'umbrella',
  globe: 'airplane',
  gift: 'gift',
  heart: 'heart',
  award: 'trophy',
  smartphone: 'phone-portrait',
  truck: 'car-sport',
  'shopping-bag': 'bag-handle',
  coffee: 'cafe',
  activity: 'medkit',
  zap: 'flash',
  users: 'people',
  sun: 'sunny',
  music: 'musical-notes',
  tool: 'construct',
  star: 'star',
};

export function PurposeIcon({ icon, size = 20, color }: { icon?: string | null; size?: number; color: string }) {
  const glyph = icon ? PURPOSE_GLYPH[icon] : undefined;
  if (glyph || !icon || !(icon in Feather.glyphMap)) return <Ionicons name={glyph ?? 'wallet'} size={size} color={color} />;
  // Older records with an icon outside the current set.
  return <Feather name={icon as IconName} size={size} color={color} />;
}

// ---------------------------------------------------------------- Avatar (initials)
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({
  name,
  seed,
  size = 36,
  ring,
  uri,
}: {
  name?: string | null;
  seed?: string;
  size?: number;
  ring?: string;
  /** Profile picture URL; falls back to initials when missing. */
  uri?: string | null;
}) {
  const dark = useIsDark();
  const t = circleTints[tintNames[hash(seed ?? name ?? '') % tintNames.length]];
  if (uri) {
    return (
      <Image
        source={{ uri }}
        contentFit="cover"
        transition={150}
        accessibilityLabel={name ?? undefined}
        style={{ width: size, height: size, borderRadius: size / 2, borderWidth: ring ? 2 : 0, borderColor: ring, backgroundColor: dark ? t.dark : t.light }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: dark ? t.dark : t.light,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: ring ? 2 : 0,
        borderColor: ring,
      }}>
      <Text style={{ fontFamily: font.semibold, fontSize: size * 0.38, lineHeight: size * 0.5 }} color={t.strong}>
        {initials(name)}
      </Text>
    </View>
  );
}

export function AvatarStack({ people, size = 32, ring }: { people: { id: string; name?: string | null; uri?: string | null }[]; size?: number; ring?: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row' }}>
      {people.map((p, i) => (
        <View key={p.id} style={{ marginLeft: i ? -size * 0.3 : 0 }}>
          <Avatar name={p.name} seed={p.id} uri={p.uri} size={size} ring={ring ?? c.surface} />
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- Circle icon tile
export function CircleIcon({ icon, color, size = 44 }: { icon?: string | null; color?: string; size?: number }) {
  const t = useTint(color);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        backgroundColor: t.soft,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <PurposeIcon icon={icon} size={Math.round(size * 0.5)} color={t.strong} />
    </View>
  );
}

// ---------------------------------------------------------------- Chip
export type ChipTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'ink';
export function Chip({ label, tone = 'neutral', icon, style }: { label: string; tone?: ChipTone; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const map = {
    neutral: [c.surfaceAlt, c.text],
    success: [c.successBg, c.success],
    warning: [c.warningBg, c.warning],
    danger: [c.dangerBg, c.danger],
    info: [c.infoBg, c.info],
    brand: [c.brandSoft, c.brand],
    ink: [c.ink, c.onInk],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.chip, { backgroundColor: bg }, style]}>
      {icon && <Feather name={icon} size={12} color={fg} />}
      <Text variant="caption" color={fg}>
        {label}
      </Text>
    </View>
  );
}

export function StatusChip({ status }: { status: DisplayStatus }) {
  const t = useT();
  const cfg = {
    pending: { tone: 'neutral', icon: 'clock' },
    submitted: { tone: 'info', icon: 'upload' },
    confirmed: { tone: 'success', icon: 'check' },
    rejected: { tone: 'danger', icon: 'x' },
    late: { tone: 'warning', icon: 'alert-triangle' },
  } as const;
  return <Chip label={t(`st.${status}`)} tone={cfg[status].tone} icon={cfg[status].icon} />;
}

// ---------------------------------------------------------------- ProgressRing
export function ProgressRing({
  size = 72,
  stroke = 7,
  progress,
  color,
  track,
  children,
}: {
  size?: number;
  stroke?: number;
  progress: number;
  color?: string;
  track?: string;
  children?: ReactNode;
}) {
  const c = useColors();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <SvgCircle cx={size / 2} cy={size / 2} r={r} stroke={track ?? c.surfaceAlt} strokeWidth={stroke} fill="none" />
        <SvgCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? c.brand}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={circ * (1 - p)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------- ProgressBar
export function ProgressBar({ progress, color, height = 6, track }: { progress: number; color?: string; height?: number; track?: string }) {
  const c = useColors();
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track ?? c.surfaceAlt, overflow: 'hidden' }}>
      <View
        style={{
          width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
          height: '100%',
          borderRadius: height,
          backgroundColor: color ?? c.brand,
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------- Input
export function Input({
  label,
  hint,
  prefix,
  style,
  ...rest
}: TextInputProps & { label?: string; hint?: string; prefix?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {label && <Text variant="smallBold">{label}</Text>}
      <View
        style={{
          flexDirection: 'row',
          alignItems: rest.multiline ? 'flex-start' : 'center',
          backgroundColor: c.surface,
          borderColor: c.border,
          borderWidth: 1,
          borderRadius: radius.md,
          paddingHorizontal: 14,
        }}>
        {prefix && (
          <Text variant="bodyMedium" tone="muted" style={{ marginRight: 6 }}>
            {prefix}
          </Text>
        )}
        <TextInput
          placeholderTextColor={c.textFaint}
          {...rest}
          style={[
            {
              flex: 1,
              paddingVertical: rest.multiline ? 12 : 0,
              height: rest.multiline ? undefined : 48,
              minHeight: rest.multiline ? 110 : undefined,
              textAlignVertical: rest.multiline ? 'top' : 'center',
              fontFamily: font.regular,
              fontSize: 15,
              color: c.text,
              outlineStyle: 'none',
            } as never,
            style,
          ]}
        />
      </View>
      {hint && (
        <Text variant="small" tone="faint">
          {hint}
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- Segmented
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const c = useColors();
  return (
    <View style={[styles.seg, { backgroundColor: c.surfaceAlt }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <PressableScale
            key={o.value}
            onPress={() => onChange(o.value)}
            hapticOnPress={false}
            style={[styles.segItem, active && [styles.segActive, { backgroundColor: c.surface, shadowColor: c.shadow }]]}>
            <Text variant="smallBold" color={active ? c.text : c.textMuted} center numberOfLines={1}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- misc
export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.section}>
      <Text variant="h3">{title}</Text>
      {action && (
        <PressableScale onPress={onAction} hapticOnPress={false}>
          <Text variant="smallBold" tone="brand">
            {action}
          </Text>
        </PressableScale>
      )}
    </View>
  );
}

export function EmptyState({ icon, title, body, children }: { icon: IconName; title: string; body?: string; children?: ReactNode }) {
  void icon;
  return (
    <View style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16, gap: 8 }}>
      <Mascot size={92} mood="neutral" />
      <Text variant="h2" center>
        {title}
      </Text>
      {body && (
        <Text tone="muted" center style={{ maxWidth: 380 }}>
          {body}
        </Text>
      )}
      {children && <View style={{ marginTop: 12, alignSelf: 'stretch', gap: 10, maxWidth: 380, width: '100%', marginHorizontal: 'auto' }}>{children}</View>}
    </View>
  );
}

export function IconButton({
  icon,
  onPress,
  bg,
  color,
  size = 40,
  label,
}: {
  icon: IconName;
  onPress?: () => void;
  bg?: string;
  color?: string;
  size?: number;
  label?: string;
}) {
  const c = useColors();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={label}
      hapticOnPress={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg ?? c.surface,
        borderWidth: bg ? 0 : 1,
        borderColor: c.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Feather name={icon} size={Math.round(size * 0.45)} color={color ?? c.text} />
    </PressableScale>
  );
}

export function Divider() {
  const c = useColors();
  return <View style={{ height: 1, backgroundColor: c.border }} />;
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const c = useColors();
  return (
    <View style={[styles.stat, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="h1" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      {hint && (
        <Text variant="small" tone="faint">
          {hint}
        </Text>
      )}
    </View>
  );
}

export function Notice({ tone, icon, title, body }: { tone: 'warning' | 'info' | 'danger' | 'success'; icon: IconName; title: string; body?: string }) {
  const c = useColors();
  const bg = { warning: c.warningBg, info: c.infoBg, danger: c.dangerBg, success: c.successBg }[tone];
  const fg = { warning: c.warning, info: c.info, danger: c.danger, success: c.success }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: bg }]}>
      <Feather name={icon} size={18} color={fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyBold" color={fg}>
          {title}
        </Text>
        {body && (
          <Text variant="small" color={fg}>
            {body}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  seg: { flexDirection: 'row', borderRadius: radius.pill, padding: 4, gap: 4 },
  segItem: { flex: 1, paddingVertical: 9, paddingHorizontal: 8, borderRadius: radius.pill },
  segActive: { shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  emptyIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stat: { flex: 1, borderWidth: 0, borderRadius: radius.lg, padding: 18, gap: 4 },
  notice: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.md },
});
