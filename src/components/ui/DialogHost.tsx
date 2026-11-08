import { Feather } from '@expo/vector-icons';
import { useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { currentDialog, dismissDialog, subscribeDialogs, type Dialog } from '@/lib/alert';
import { useColors } from '@/lib/prefs';
import { radius } from '@/theme/tokens';

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
      <View style={[styles.box, { backgroundColor: bg }]}>
        <View style={[styles.icon, { backgroundColor: solid }]}>
          <Feather name={shown.icon} size={22} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="h3" color={fg}>
            {shown.title}
          </Text>
          {shown.message ? (
            <Text variant="small" color={fg}>
              {shown.message}
            </Text>
          ) : null}
        </View>
      </View>
      {shown.kind === 'confirm' ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Cancel" variant="secondary" full={false} style={{ flex: 1 }} onPress={close} />
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
  box: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: radius.md, alignItems: 'flex-start' },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
