import { Feather } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import Svg, { Circle as SvgCircle } from 'react-native-svg';

import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useColors, useT } from '@/lib/prefs';
import type { DisplayStatus } from '@/lib/types';
import { font, radius } from '@/theme/tokens';

// ---------------------------------------------------------------- Avatar
export function Avatar({ emoji, size = 40, bg, ring }: { emoji?: string | null; size?: number; bg?: string; ring?: string }) {
  const c = useColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg ?? c.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: ring ? 2 : 0,
        borderColor: ring,
      }}>
      <Text style={{ fontSize: size * 0.5, lineHeight: size * 0.62 }}>{emoji || '🙂'}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- Chip
export function Chip({
  label,
  tone = 'neutral',
  icon,
  style,
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'ink';
  icon?: ComponentProps<typeof Feather>['name'];
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const map = {
    neutral: [c.surfaceAlt, c.textMuted],
    success: [c.successBg, c.success],
    warning: [c.warningBg, c.warning],
    danger: [c.dangerBg, c.danger],
    info: [c.infoBg, c.info],
    accent: [c.accent, c.accentInk],
    ink: [c.ink, c.onInk],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.chip, { backgroundColor: bg }, style]}>
      {icon && <Feather name={icon} size={12} color={fg} />}
      <Text variant="smallBold" color={fg} style={{ fontSize: 12 }}>
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
  stroke = 8,
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
          stroke={color ?? c.accent}
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
export function ProgressBar({ progress, color, height = 8 }: { progress: number; color?: string; height?: number }) {
  const c = useColors();
  return (
    <View style={{ height, borderRadius: height, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}>
      <View
        style={{
          width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
          height: '100%',
          borderRadius: height,
          backgroundColor: color ?? c.accent,
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------- Input
export function Input({ label, hint, style, ...rest }: TextInputProps & { label?: string; hint?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {label && (
        <Text variant="smallBold" tone="muted">
          {label}
        </Text>
      )}
      <TextInput
        placeholderTextColor={c.textFaint}
        {...rest}
        style={[
          {
            backgroundColor: c.surface,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: radius.md,
            paddingHorizontal: 16,
            paddingVertical: rest.multiline ? 14 : 0,
            height: rest.multiline ? undefined : 54,
            minHeight: rest.multiline ? 100 : undefined,
            textAlignVertical: rest.multiline ? 'top' : 'center',
            fontFamily: font.semibold,
            fontSize: 16,
            color: c.text,
          },
          style,
        ]}
      />
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
            style={[styles.segItem, active && { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1 }]}>
            <Text variant="smallBold" tone={active ? 'default' : 'muted'} center>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- Row / misc
export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.section}>
      <Text variant="h3">{title}</Text>
      {action && (
        <PressableScale onPress={onAction} hapticOnPress={false}>
          <Text variant="smallBold" tone="muted">
            {action}
          </Text>
        </PressableScale>
      )}
    </View>
  );
}

export function EmptyState({ emoji, title, body, children }: { emoji: string; title: string; body?: string; children?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 16, gap: 8 }}>
      <Text style={{ fontSize: 52, lineHeight: 64 }}>{emoji}</Text>
      <Text variant="h2" center>
        {title}
      </Text>
      {body && (
        <Text tone="muted" center>
          {body}
        </Text>
      )}
      {children && <View style={{ marginTop: 12, alignSelf: 'stretch', gap: 10 }}>{children}</View>}
    </View>
  );
}

export function IconButton({
  icon,
  onPress,
  bg,
  color,
  size = 44,
}: {
  icon: ComponentProps<typeof Feather>['name'];
  onPress?: () => void;
  bg?: string;
  color?: string;
  size?: number;
}) {
  const c = useColors();
  return (
    <PressableScale
      onPress={onPress}
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
      <Feather name={icon} size={size * 0.42} color={color ?? c.text} />
    </PressableScale>
  );
}

export function Divider() {
  const c = useColors();
  return <View style={{ height: 1, backgroundColor: c.border }} />;
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
  segItem: { flex: 1, paddingVertical: 10, borderRadius: radius.pill },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
});
