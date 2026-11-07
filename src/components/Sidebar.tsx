import { Feather } from '@expo/vector-icons';
import { router, usePathname, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Logo } from '@/components/Brand';
import { NavIcon, type NavIconName } from '@/components/NavIcons';
import { NewCircleSheet } from '@/components/NewCircleSheet';
import { Avatar, CircleIcon } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useMyCircles } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useColors } from '@/lib/prefs';
import { onTimeStreak } from '@/lib/rewards';
import { useManagedCircles } from '@/lib/local';
import { radius, SIDEBAR_WIDTH } from '@/theme/tokens';

type Item = { href: '/' | '/circles' | '/ipon' | '/assistant' | '/activity' | '/profile' | '/settings'; icon: NavIconName; label: string };

const ITEMS: Item[] = [
  { href: '/', icon: 'home', label: 'Home' },
  { href: '/circles', icon: 'circles', label: 'Circles' },
  { href: '/ipon', icon: 'ipon', label: 'Ipon' },
  { href: '/assistant', icon: 'assistant', label: 'Ask Ipon' },
  { href: '/activity', icon: 'activity', label: 'Activity' },
  { href: '/profile', icon: 'profile', label: 'Profile' },
  { href: '/settings', icon: 'settings', label: 'Settings' },
];

/** Desktop navigation. */
export function Sidebar() {
  const c = useColors();
  const path = usePathname();
  const { profile, isDemo, isGuest } = useAuth();
  const circles = useMyCircles();
  const managed = useManagedCircles();
  const [open, setOpen] = useState(false);
  const streak = onTimeStreak(circles.data ?? []);
  const isActive = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  return (
    <View style={[styles.wrap, { backgroundColor: c.surface, borderRightColor: c.border }]}>
      <View style={{ paddingHorizontal: 6 }}>
        <Logo />
      </View>

      <Button title="New circle" icon="plus" size="md" onPress={() => setOpen(true)} />

      <View style={{ gap: 4 }}>
        {ITEMS.map((it) => {
          const active = isActive(it.href);
          return (
            <PressableScale
              key={it.href}
              hapticOnPress={false}
              scaleTo={0.98}
              onPress={() => router.navigate(it.href as Href)}
              style={[styles.item, active && { backgroundColor: c.brandSoft }]}>
              <NavIcon name={it.icon} size={21} active={active} color={active ? c.brand : c.textMuted} />
              <Text variant="bodyBold" color={active ? c.text : c.textMuted}>
                {it.label}
              </Text>
            </PressableScale>
          );
        })}
      </View>

      {(!!circles.data?.length || managed.length > 0) && (
        <View style={{ gap: 4 }}>
          <Text variant="overline" tone="faint" style={{ paddingHorizontal: 12, marginBottom: 4 }}>
            My circles
          </Text>
          {managed.slice(0, 4).map((m) => {
            const active = path.startsWith(`/managed/${m.id}`);
            return (
              <PressableScale
                key={m.id}
                hapticOnPress={false}
                scaleTo={0.98}
                onPress={() => router.navigate(`/managed/${m.id}` as Href)}
                style={[styles.item, { paddingVertical: 7 }, active && { backgroundColor: c.brandSoft }]}>
                <CircleIcon icon={m.emoji} color={m.color} size={28} />
                <Text variant="smallBold" tone={active ? 'default' : 'muted'} numberOfLines={1} style={{ flex: 1 }}>
                  {m.name}
                </Text>
                <Feather name="smartphone" size={13} color={c.textFaint} />
              </PressableScale>
            );
          })}
          {(circles.data ?? []).slice(0, 6).map(({ circle }) => {
            const active = path.startsWith(`/circle/${circle.id}`);
            return (
              <PressableScale
                key={circle.id}
                hapticOnPress={false}
                scaleTo={0.98}
                onPress={() => router.navigate(`/circle/${circle.id}`)}
                style={[styles.item, { paddingVertical: 7 }, active && { backgroundColor: c.brandSoft }]}>
                <CircleIcon icon={circle.emoji} color={circle.color} size={28} />
                <Text variant="smallBold" tone={active ? 'default' : 'muted'} numberOfLines={1} style={{ flex: 1 }}>
                  {circle.name}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      )}

      <View style={{ flex: 1 }} />

      <View style={[styles.streak, { backgroundColor: c.warningBg }]}>
        <Feather name="zap" size={18} color={c.warning} />
        <View style={{ flex: 1 }}>
          <Text variant="smallBold" tone="warning">
            {streak > 0 ? `${streak} on-time streak` : 'No streak yet'}
          </Text>
          <Text variant="caption" tone="warning" style={{ opacity: 0.8 }}>
            {isDemo ? 'Sample data' : isGuest ? 'Testing mode · guest account' : 'Pay on time to keep it going'}
          </Text>
        </View>
      </View>

      <PressableScale hapticOnPress={false} onPress={() => router.navigate('/profile')} style={[styles.user, { borderTopColor: c.border }]}>
        <Avatar name={profile?.full_name} seed={profile?.id} uri={profile?.avatar_url} size={36} />
        <View style={{ flex: 1 }}>
          <Text variant="smallBold" numberOfLines={1}>
            {profile?.full_name}
          </Text>
          <Text variant="caption" tone="faint">
            Trust Score {profile?.tiwala_score ?? '—'}
          </Text>
        </View>
        <Feather name="chevron-right" size={16} color={c.textFaint} />
      </PressableScale>
      <NewCircleSheet open={open} onClose={() => setOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIDEBAR_WIDTH, borderRightWidth: 1, padding: 20, gap: 22 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md },
  user: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 14, borderTopWidth: 1, paddingHorizontal: 4 },
});
