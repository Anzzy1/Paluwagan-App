import { Alert, Platform } from 'react-native';

import { errMsg } from '@/lib/supabase';

/** Cross-platform alert (react-native-web's Alert.alert is a no-op). */
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

export function notifyError(e: unknown, title = 'Something went wrong') {
  notify(title, errMsg(e));
}

/** Cross-platform confirmation dialog. */
export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void,
  opts: { confirmText?: string; destructive?: boolean } = {},
) {
  if (Platform.OS === 'web') {
    if (window.confirm(message ? `${title}\n\n${message}` : title)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: opts.confirmText ?? 'Confirm', style: opts.destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
