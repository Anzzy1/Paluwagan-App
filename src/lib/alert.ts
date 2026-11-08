import type { ComponentProps } from 'react';
import type { Feather } from '@expo/vector-icons';

import { errMsg } from '@/lib/supabase';

/**
 * In-app dialogs (no browser/OS alert popups). Calls queue up here and the
 * <DialogHost /> mounted in the root layout shows them one at a time.
 */
export type DialogTone = 'info' | 'success' | 'warning' | 'danger' | 'brand';

export type Dialog = {
  id: number;
  kind: 'notify' | 'confirm';
  tone: DialogTone;
  icon: ComponentProps<typeof Feather>['name'];
  title: string;
  message?: string;
  confirmText?: string;
  onConfirm?: () => void;
};

let queue: Dialog[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function push(d: Omit<Dialog, 'id'>) {
  queue = [...queue, { ...d, id: nextId++ }];
  listeners.forEach((l) => l());
}

export function dismissDialog(id: number) {
  queue = queue.filter((d) => d.id !== id);
  listeners.forEach((l) => l());
}

export function subscribeDialogs(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const currentDialog = () => queue[0] ?? null;

const toneIcon: Record<DialogTone, Dialog['icon']> = {
  info: 'info',
  success: 'check-circle',
  warning: 'alert-triangle',
  danger: 'alert-circle',
  brand: 'help-circle',
};

/** Message with a single OK button. */
export function notify(title: string, message?: string, tone: DialogTone = 'info') {
  push({ kind: 'notify', tone, icon: toneIcon[tone], title, message });
}

export function notifyError(e: unknown, title = 'Something went wrong') {
  notify(title, errMsg(e), 'danger');
}

/** Cancel / confirm dialog. Destructive actions get the red warning style. */
export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void,
  opts: { confirmText?: string; destructive?: boolean; icon?: Dialog['icon'] } = {},
) {
  const tone: DialogTone = opts.destructive ? 'danger' : 'brand';
  push({
    kind: 'confirm',
    tone,
    icon: opts.icon ?? (opts.destructive ? 'alert-triangle' : toneIcon.brand),
    title,
    message: message || undefined,
    confirmText: opts.confirmText ?? 'Confirm',
    onConfirm,
  });
}
