import { Feather } from '@expo/vector-icons';
import { useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { currentDialog, dismissDialog, subscribeDialogs, type Dialog } from '@/lib/alert';
import { useColors } from '@/lib/prefs';

/** Renders the in-app dialogs queued by notify / notifyError / confirmAction. Mount once at the root. */
export function DialogHost() {
  const c = useColors();
  const current = useSyncExternalStore(subscribeDialogs, currentDialog, currentDialog);
  // Keep the last dialog's content while the sheet animates closed.
  const [shown, setShown] = useState<Dialog | null>(current);
  if (current && current !== shown) setShown(current);
  if (!shown) return null;

  const fg = { info: c.info, success: c.success, warning: c.warning, danger: c.danger, brand: c.brandText }[shown.tone];
  const bg = { info: c.infoBg, success: c.successBg, warning: c.warningBg, danger: c.dangerBg, brand: c.brandSoft }[shown.tone];
  const solid = shown.tone === 'brand' ? c.brand : fg;
  const close = () => dismissDialog(shown.id);

  return (
    <Sheet open={!!current} onClose={close}>
      <View style={styles.body}>
        <View style={[styles.icon, { backgroundColor: bg }]}>
          <Feather name={shown.icon} size={26} color={fg} />
        </View>
        <Text variant="h2" center>
          {shown.title}
        </Text>
        {shown.message ? (
          <Text variant="small" tone="muted" center style={{ maxWidth: 340 }}>
            {shown.message}
          </Text>
        ) : null}
      </View>
      {shown.kind === 'confirm' ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title={shown.cancelText ?? 'Cancel'} variant="secondary" full={false} style={{ flex: 1 }} onPress={close} />
          <Button
            title={shown.confirmText ?? 'Confirm'}
            full={false}
            style={{ flex: 1.4, backgroundColor: solid }}
            onPress={() => {
              close();
              shown.onConfirm?.();
            }}
          />
        </View>
      ) : (
        <Button title="OK" full style={shown.tone === 'brand' ? undefined : { backgroundColor: solid }} onPress={close} />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: 8, paddingTop: 4, paddingBottom: 8 },
  icon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
