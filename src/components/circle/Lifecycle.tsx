import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Input, type IconName } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { notify, notifyError } from '@/lib/alert';
import { useCircleLifecycle } from '@/lib/api';
import { longDate } from '@/lib/format';
import { useColors } from '@/lib/prefs';
import type { Circle } from '@/lib/types';
import { radius } from '@/theme/tokens';

/**
 * In-app warning before a serious action: a tinted warning box listing what will happen,
 * then Cancel and a confirm button in the matching colour.
 */
export function ConfirmSheet({
  open,
  onClose,
  tone,
  icon,
  title,
  points,
  confirmLabel,
  onConfirm,
  loading,
  children,
}: {
  open: boolean;
  onClose: () => void;
  tone: 'danger' | 'warning';
  icon: IconName;
  title: string;
  points: string[];
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  children?: ReactNode;
}) {
  const c = useColors();
  const fg = tone === 'danger' ? c.danger : c.warning;
  const bg = tone === 'danger' ? c.dangerBg : c.warningBg;
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <View style={[styles.warn, { backgroundColor: bg }]}>
        <View style={[styles.warnIcon, { backgroundColor: fg }]}>
          <Feather name={icon} size={20} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          {points.map((p) => (
            <View key={p} style={{ flexDirection: 'row', gap: 8 }}>
              <Text variant="small" color={fg}>
                •
              </Text>
              <Text variant="small" color={fg} style={{ flex: 1 }}>
                {p}
              </Text>
            </View>
          ))}
        </View>
      </View>
      {children}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Cancel" variant="secondary" style={{ flex: 1 }} full={false} disabled={loading} onPress={onClose} />
        <Button
          title={confirmLabel}
          full={false}
          loading={loading}
          onPress={onConfirm}
          style={{ flex: 1.4, backgroundColor: fg }}
        />
      </View>
    </Sheet>
  );
}

/** Red "Delete paluwagan" button + its warning. Admin only, before the paluwagan starts. */
export function DeleteCircleButton({ circle }: { circle: Circle }) {
  const life = useCircleLifecycle();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button title="Delete paluwagan" icon="trash-2" variant="danger" onPress={() => setOpen(true)} />
      <ConfirmSheet
        open={open}
        onClose={() => setOpen(false)}
        tone="danger"
        icon="trash-2"
        title="Delete this paluwagan?"
        points={[
          `“${circle.name}” will disappear for all members, and no one can join with its invite code.`,
          'It moves to Deleted in your Paluwagan tab. You can restore it from there if you decide to continue.',
          'Pending join requests stay as they are until you restore it.',
        ]}
        confirmLabel="Delete paluwagan"
        loading={life.remove.isPending}
        onConfirm={() =>
          life.remove.mutate(circle.id, {
            onSuccess: () => {
              setOpen(false);
              router.replace('/circles');
            },
            onError: (e) => notifyError(e, 'Couldn’t delete'),
          })
        }
      />
    </>
  );
}

/** Shown on a deleted paluwagan's page: restore or delete forever. */
export function DeletedPanel({ circle, isAdmin }: { circle: Circle; isAdmin: boolean }) {
  const c = useColors();
  const life = useCircleLifecycle();
  const [purge, setPurge] = useState(false);
  return (
    <Card style={{ gap: 12, backgroundColor: c.dangerBg, borderColor: c.dangerBg }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Feather name="trash-2" size={18} color={c.danger} />
        <Text variant="h3" color={c.danger} style={{ flex: 1 }}>
          Deleted {circle.deleted_at ? longDate(circle.deleted_at.slice(0, 10)) : ''}
        </Text>
      </View>
      <Text variant="small" color={c.danger}>
        This paluwagan is hidden from members and can’t be joined. Restore it to continue where you left off.
      </Text>
      {isAdmin && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            title="Restore"
            icon="rotate-ccw"
            full={false}
            style={{ flex: 1 }}
            loading={life.restore.isPending}
            onPress={() => life.restore.mutate(circle.id, { onError: (e) => notifyError(e, 'Couldn’t restore') })}
          />
          <Button title="Delete forever" icon="x" variant="secondary" full={false} style={{ flex: 1 }} onPress={() => setPurge(true)} />
        </View>
      )}
      <PurgeSheet circle={circle} open={purge} onClose={() => setPurge(false)} onDone={() => router.replace('/circles')} />
    </Card>
  );
}

export function PurgeSheet({ circle, open, onClose, onDone }: { circle: Circle; open: boolean; onClose: () => void; onDone?: () => void }) {
  const life = useCircleLifecycle();
  return (
    <ConfirmSheet
      open={open}
      onClose={onClose}
      tone="danger"
      icon="alert-triangle"
      title="Delete forever?"
      points={[
        `“${circle.name}”, its members, invites and activity will be permanently removed.`,
        'Ipon goals linked to it are kept, just unlinked.',
        'This can’t be undone.',
      ]}
      confirmLabel="Delete forever"
      loading={life.purge.isPending}
      onConfirm={() =>
        life.purge.mutate(circle.id, {
          onSuccess: () => {
            onClose();
            onDone?.();
          },
          onError: (e) => notifyError(e, 'Couldn’t delete'),
        })
      }
    />
  );
}

/** Pause button (admin, running paluwagan) with a reason field and what pausing does. */
export function PauseCircleButton({ circle }: { circle: Circle }) {
  const life = useCircleLifecycle();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <>
      <Button title="Pause paluwagan" icon="pause" variant="secondary" onPress={() => setOpen(true)} />
      <ConfirmSheet
        open={open}
        onClose={() => setOpen(false)}
        tone="warning"
        icon="pause"
        title="Pause this paluwagan?"
        points={[
          'Use this for emergencies, like a member who can’t pay for a while or a calamity.',
          'Reminders stop and every member sees that it’s paused, with your reason.',
          'When you resume, every hulog and payout not yet due moves later by the days it was paused.',
        ]}
        confirmLabel="Pause"
        loading={life.pause.isPending}
        onConfirm={() =>
          life.pause.mutate(
            { id: circle.id, reason: reason.trim() },
            {
              onSuccess: () => {
                setOpen(false);
                setReason('');
              },
              onError: (e) => notifyError(e, 'Couldn’t pause'),
            },
          )
        }>
        <Input label="Reason (shown to members)" placeholder="e.g. Typhoon, we’ll continue next month" value={reason} onChangeText={setReason} maxLength={200} />
      </ConfirmSheet>
    </>
  );
}

/** Banner on a paused paluwagan; the admin can resume from here. */
export function PausedPanel({ circle, isAdmin }: { circle: Circle; isAdmin: boolean }) {
  const c = useColors();
  const life = useCircleLifecycle();
  const [open, setOpen] = useState(false);
  const since = circle.paused_at ? circle.paused_at.slice(0, 10) : null;
  return (
    <Card style={{ gap: 10, backgroundColor: c.warningBg, borderColor: c.warningBg }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Feather name="pause-circle" size={20} color={c.warning} />
        <Text variant="h3" color={c.warning} style={{ flex: 1 }}>
          Paused{since ? ` since ${longDate(since)}` : ''}
        </Text>
      </View>
      {circle.pause_reason && (
        <Text variant="body" color={c.warning}>
          “{circle.pause_reason}”
        </Text>
      )}
      <Text variant="small" color={c.warning}>
        Reminders are off. Upcoming due dates will move later by the number of days it stays paused.
      </Text>
      {isAdmin && <Button title="Resume paluwagan" icon="play" onPress={() => setOpen(true)} />}
      <ConfirmSheet
        open={open}
        onClose={() => setOpen(false)}
        tone="warning"
        icon="play"
        title="Resume this paluwagan?"
        points={[
          'Reminders start again for every member.',
          'Each hulog and payout that wasn’t due yet when you paused moves later by the days it was paused.',
        ]}
        confirmLabel="Resume"
        loading={life.resume.isPending}
        onConfirm={() =>
          life.resume.mutate(circle.id, {
            onSuccess: (days) => {
              setOpen(false);
              notify('Paluwagan resumed', days ? `Upcoming dates moved ${days} day${days === 1 ? '' : 's'} later.` : 'Dates stay the same.', 'success');
            },
            onError: (e) => notifyError(e, 'Couldn’t resume'),
          })
        }
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  warn: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.md },
  warnIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
