import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui/bits';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/lib/prefs';

export const TAB_BAR_SPACE = 110;

export function Screen({
  children,
  title,
  subtitle,
  back,
  right,
  scroll = true,
  tabs = false,
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
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: ViewStyle;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const header =
    title || back || right ? (
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {back ? <IconButton icon="arrow-left" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} /> : <View />}
          <View style={{ flexDirection: 'row', gap: 8 }}>{right}</View>
        </View>
        {title && (
          <View style={{ marginTop: back || right ? 16 : 0 }}>
            <Text variant="display">{title}</Text>
            {subtitle && (
              <Text tone="muted" style={{ marginTop: 4 }}>
                {subtitle}
              </Text>
            )}
          </View>
        )}
      </View>
    ) : null;

  const padBottom = (tabs ? TAB_BAR_SPACE : 32) + insets.bottom;
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: footer ? 24 : padBottom }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.textMuted} /> : undefined}>
      {header}
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, { flex: 1, paddingBottom: footer ? 0 : padBottom }, contentStyle]}>
      {header}
      {children}
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      {body}
      {footer && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16), backgroundColor: c.bg, borderTopColor: c.border }]}>
          {footer}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },
  header: { marginBottom: 4 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  footer: { paddingHorizontal: 20, paddingTop: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
