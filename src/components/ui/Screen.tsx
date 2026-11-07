import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui/bits';
import { Text } from '@/components/ui/Text';
import { useColors, useIsDesktop } from '@/lib/prefs';
import { CONTENT_MAX_WIDTH } from '@/theme/tokens';

export const TAB_BAR_SPACE = 104;

export function Screen({
  children,
  title,
  subtitle,
  back,
  right,
  scroll = true,
  tabs = false,
  narrow = false,
  footer,
  refreshing,
  onRefresh,
  contentStyle,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  scroll?: boolean;
  tabs?: boolean;
  /** Constrain width for forms (desktop). */
  narrow?: boolean;
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: ViewStyle;
}) {
  const c = useColors();
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const maxWidth = narrow ? 640 : CONTENT_MAX_WIDTH;
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const header =
    title || back || right ? (
      <View style={{ gap: 14, marginBottom: 4 }}>
        {(back || (right && !desktop)) && (
          <View style={styles.headerRow}>
            {back ? <IconButton icon="arrow-left" onPress={goBack} label="Back" /> : <View />}
            {!desktop && <View style={styles.actions}>{right}</View>}
          </View>
        )}
        {title && (
          <View style={[styles.titleRow, desktop && { alignItems: 'flex-end' }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant={desktop ? 'display' : 'h1'}>{title}</Text>
              {subtitle && <Text tone="muted">{subtitle}</Text>}
            </View>
            {desktop && right && <View style={styles.actions}>{right}</View>}
          </View>
        )}
        {!title && desktop && right && <View style={[styles.actions, { alignSelf: 'flex-end' }]}>{right}</View>}
      </View>
    ) : null;

  const padBottom = desktop ? 48 : (tabs ? TAB_BAR_SPACE : 32) + insets.bottom;
  const inner = (
    <View style={[styles.inner, { maxWidth }, contentStyle]}>
      {header}
      {children}
      {desktop && footer && <View style={{ gap: 10, marginTop: 8 }}>{footer}</View>}
    </View>
  );

  const pad = desktop
    ? { paddingHorizontal: 40, paddingTop: 36 }
    : { paddingHorizontal: 20, paddingTop: 8 };

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[pad, { paddingBottom: footer && !desktop ? 24 : padBottom }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh && !desktop ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.textMuted} /> : undefined}>
      {inner}
    </ScrollView>
  ) : (
    <View style={[pad, { flex: 1, paddingBottom: padBottom }]}>{inner}</View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: c.bg, paddingTop: desktop ? 0 : insets.top }}>
      {body}
      {footer && !desktop && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16), backgroundColor: c.bg, borderTopColor: c.border }]}>
          {footer}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/** Two-column layout on desktop, stacked on mobile. */
export function Columns({ main, side, sideWidth = 360 }: { main: ReactNode; side: ReactNode; sideWidth?: number }) {
  const desktop = useIsDesktop();
  if (!desktop) {
    return (
      <>
        {main}
        {side}
      </>
    );
  }
  return (
    <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
      <View style={{ flex: 1, gap: 16, minWidth: 0 }}>{main}</View>
      <View style={{ width: sideWidth, gap: 16 }}>{side}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { width: '100%', alignSelf: 'center', gap: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 40 },
  titleRow: { flexDirection: 'row', gap: 16 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  footer: { paddingHorizontal: 20, paddingTop: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
